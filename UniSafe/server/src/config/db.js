import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'fs';

// ── Connection resolution ───────────────────────────────────────────────
// Postgres is used when DATABASE_URL is set, or when any DB_* part is set.
// Otherwise the server falls back to a local SQLite file for development.
function resolveConnection() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return { connectionString: url };

  const host = process.env.DB_HOST?.trim();
  if (!host) return null;

  return {
    host,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'postgres',
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  };
}

const connection = resolveConnection();
const usePostgres = Boolean(connection);
const context = new AsyncLocalStorage();
const defaultSqlitePath = fileURLToPath(new URL('../../data/unisafe.db', import.meta.url));
let sqlite;
let initialization;
let sqliteQueue = Promise.resolve();

pg.types.setTypeParser(20, value => Number(value));
pg.types.setTypeParser(1700, value => Number(value));

// Managed providers (Render, Supabase, Neon, Railway, Azure, Heroku) require
// TLS. Certificate verification is relaxed by default because several of them
// present chains Node does not trust; set DB_SSL_REJECT_UNAUTHORIZED=true and
// DB_SSL_CA to tighten it.
function resolveSsl() {
  const explicit = (process.env.DB_SSL || '').trim().toLowerCase();
  if (['false', '0', 'off', 'disable'].includes(explicit)) return false;
  if (['true', '1', 'on', 'require'].includes(explicit)) return sslOptions();

  const target = (connection.connectionString || connection.host || '').toLowerCase();
  if (/(supabase|neon|render\.com|onrender|azure|aws|heroku|elephantsql|railway|fly\.io|cleardb)/.test(target)) {
    return sslOptions();
  }
  return undefined;
}

function sslOptions() {
  const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true';
  const ca = process.env.DB_SSL_CA;
  return { rejectUnauthorized, ...(ca ? { ca: fs.readFileSync(ca, 'utf-8') } : {}) };
}

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) return fallback;
  return value;
}

const pool = usePostgres ? new pg.Pool({
  ...connection,
  ssl: resolveSsl(),
  max: integerEnv('DB_POOL_MAX', 10, 1, 100),
  idleTimeoutMillis: integerEnv('DB_IDLE_TIMEOUT_MS', 30000, 1000, 600000),
  // Free-tier instances cold-start, so allow a generous connect timeout.
  connectionTimeoutMillis: integerEnv('DB_CONNECT_TIMEOUT_MS', 15000, 1000, 120000),
}) : null;

pool?.on('error', error => console.error('PostgreSQL pool error:', error.code || 'connection failure'));

export function isPostgres() {
  return usePostgres;
}

export function arrayParameter(value) {
  return usePostgres ? value : JSON.stringify(value);
}

/**
 * Read a JSON/array column regardless of engine.
 * Postgres drivers return a real array/object; SQLite returns JSON text.
 */
export function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Split a SQL script into individual statements.
 *
 * A plain split on `;` corrupts PL/pgSQL bodies ($$ ... $$) and any string
 * literal containing a semicolon, so this tracks quoting state properly.
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const pair = sql.slice(i, i + 2);

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      current += pair;
      if (pair === '*/') { inBlockComment = false; i += 2; } else { i += 1; }
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        current += ch;
        i += 1;
      }
      continue;
    }

    if (inString) {
      current += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { current += "'"; i += 2; continue; }
        inString = false;
      }
      i += 1;
      continue;
    }

    if (pair === '--') { inLineComment = true; current += pair; i += 2; continue; }
    if (pair === '/*') { inBlockComment = true; current += pair; i += 2; continue; }
    if (ch === "'") { inString = true; current += ch; i += 1; continue; }
    if (ch === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tag) { dollarTag = tag[0]; current += tag[0]; i += tag[0].length; continue; }
    }
    if (ch === ';') { statements.push(current); current = ''; i += 1; continue; }

    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current);

  return statements.map(stripLeadingNoise).filter(Boolean);
}

/** Remove leading whitespace and SQL comments so empty chunks are detectable. */
function stripLeadingNoise(statement) {
  let text = statement;
  for (let guard = 0; guard < 200; guard += 1) {
    const before = text.length;
    text = text.replace(/^\s+/, '').replace(/^--[^\n]*\n?/, '').replace(/^\/\*[\s\S]*?\*\//, '');
    if (text.length === before) break;
  }
  return text.trim();
}

/** Errors that mean "this object already exists", so the script is idempotent. */
const ALREADY_EXISTS = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object (type, function)
  '23505', // unique_violation (seed re-runs)
  '42701', // duplicate_column
]);

export async function runPostgreSQLSchema({ quiet = false } = {}) {
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const statements = splitSqlStatements(schema);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Each statement runs inside its own SAVEPOINT. PostgreSQL aborts the whole
    // transaction on the first error, including the "already exists" errors we
    // intentionally swallow below, so without a savepoint every later statement
    // would fail with 25P02 and the schema could never be re-applied. The
    // savepoint rolls just that statement back and leaves the run usable.
    for (const [index, statement] of statements.entries()) {
      const savepoint = `schema_stmt_${index}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        await client.query(statement);
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => {});
        if (ALREADY_EXISTS.has(err.code)) {
          if (!quiet) console.log('  skipped (already exists):', statement.split('\n')[0].slice(0, 70));
          continue;
        }
        throw err;
      }
      await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => {});
    }

    await client.query('COMMIT');
    if (!quiet) console.log(`PostgreSQL schema initialized (${statements.length} statements).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PostgreSQL schema initialization failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function initializePostgreSQLSchema() {
  await runPostgreSQLSchema();
}

export async function initializeDatabase() {
  if (!initialization) {
    initialization = usePostgres
      ? pool.query('SELECT 1').then(() => initializePostgreSQLSchema())
      : import('./sqlite-schema.js').then(({ default: openSqlite }) => {
          const filename = process.env.SQLITE_PATH || defaultSqlitePath;
          sqlite = openSqlite(filename === ':memory:' ? filename : path.resolve(filename));
        });
  }
  await initialization;
}

// Columns that are BOOLEAN in Postgres but written as 0/1 in the shared
// SQLite-flavoured SQL. Rewriting them keeps one query working on both.
const BOOLEAN_COLUMNS = [
  'is_sos', 'is_anonymous', 'is_active', 'is_indexed',
  'revoked', 'target_all', 'success', 'is_read',
];
const BOOLEAN_COLUMN_PATTERN = new RegExp(`\\b(${BOOLEAN_COLUMNS.join('|')})(\\.)?(\\s*=\\s*)([01])\\b`, 'gi');

function postgresSql(sql) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, token => token === '?' ? `$${++index}` : token)
    .replace(/datetime\('now'\)/g, 'CURRENT_TIMESTAMP')
    .replace(/json_group_array\(/g, 'json_agg(')
    .replace(BOOLEAN_COLUMN_PATTERN, (match, column, qualifier, operator, digit) =>
      `${column}${qualifier || ''}${operator}${digit === '1' ? 'TRUE' : 'FALSE'}`);
}

function normalizeRow(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
}

async function withSqlite(operation) {
  if (context.getStore()?.sqliteTransaction) return operation();
  const result = sqliteQueue.then(operation);
  sqliteQueue = result.catch(() => undefined);
  return result;
}

async function execute(sql, params, kind) {
  await initializeDatabase();
  if (usePostgres) {
    const client = context.getStore()?.client || pool;
    const result = await client.query(postgresSql(sql), params.map(value => value === undefined ? null : value));
    if (kind === 'run') return { changes: result.rowCount };
    const rows = result.rows.map(normalizeRow);
    return kind === 'get' ? rows[0] : rows;
  }
  return withSqlite(() => {
    const values = params.map(value => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'boolean') return Number(value);
      // better-sqlite3 cannot bind plain objects; JSON/array columns are TEXT.
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    });
    return sqlite.prepare(sql)[kind](...values);
  });
}

export async function query(sql, params = []) {
  await initializeDatabase();
  if (usePostgres) {
    const result = await (context.getStore()?.client || pool).query(sql, params);
    return { ...result, rows: result.rows.map(normalizeRow) };
  }
  return withSqlite(() => {
    const statement = sqlite.prepare(sql);
    if (statement.reader) {
      const rows = statement.all(...params);
      return { rows, rowCount: rows.length };
    }
    const result = statement.run(...params);
    return { rows: [], rowCount: result.changes };
  });
}

export async function getClient() {
  if (!usePostgres) throw new Error('PostgreSQL connection requires DATABASE_URL or DB_HOST');
  return pool.connect();
}

export async function transaction(callback) {
  await initializeDatabase();
  if (context.getStore()) return callback();
  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await context.run({ client }, callback);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return withSqlite(async () => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await context.run({ sqliteTransaction: true }, callback);
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  });
}

const db = {
  prepare: sql => ({
    get: (...params) => execute(sql, params, 'get'),
    all: (...params) => execute(sql, params, 'all'),
    run: (...params) => execute(sql, params, 'run'),
  }),
  transaction,
};

export async function checkConnection() {
  await initializeDatabase();
  await query('SELECT 1');
  return { engine: usePostgres ? 'postgresql' : 'sqlite', connected: true };
}

export async function closePool() {
  await sqliteQueue;
  if (pool) await pool.end();
  if (sqlite?.open) sqlite.close();
}

export default db;
