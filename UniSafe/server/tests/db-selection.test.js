import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));

function run(code, overrides = {}) {
  // Each child evaluates db.js afresh, without local dotenv or inherited DB settings.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(DB_|PG|DATABASE_URL$|SQLITE_PATH$|ALLOW_SQLITE_FALLBACK$|NODE_ENV$)/.test(key)));
  Object.assign(env, {
    NODE_ENV: 'test', SQLITE_PATH: ':memory:',
    DOTENV_CONFIG_PATH: '__unisafe_test_no_dotenv__',
  }, overrides);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    try { ${code} } catch (error) {
      console.log(JSON.stringify({ ok: false, error: error.message }));
    }
  `], { cwd, env, encoding: 'utf8', timeout: 5000 });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

const selection = `
  const db = await import('./src/config/db.js');
  console.log(JSON.stringify({ ok: true, engine: db.isPostgres() ? 'postgresql' : 'sqlite' }));
  await db.closePool();
`;

describe('Explicit database selection', () => {
  it('prioritizes DATABASE_URL over DB_HOST and SQLite opt-in', () => {
    expect(run(selection, {
      DATABASE_URL: 'postgresql://localhost/unisafe', DB_HOST: 'invalid.example',
      DB_PORT: 'invalid', ALLOW_SQLITE_FALLBACK: 'true',
    })).toEqual({ ok: true, engine: 'postgresql' });
  });

  it('selects PostgreSQL with DB_HOST when DATABASE_URL is blank', () => {
    expect(run(selection, {
      DATABASE_URL: ' ', DB_HOST: 'localhost', DB_PORT: '5432',
      DB_NAME: 'unisafe', ALLOW_SQLITE_FALLBACK: 'true',
    })).toEqual({ ok: true, engine: 'postgresql' });
  });

  it('allows configured PostgreSQL in production', () => {
    expect(run(selection, { NODE_ENV: 'production', DB_HOST: 'localhost' }))
      .toEqual({ ok: true, engine: 'postgresql' });
  });

  it.each([undefined, 'true'])('refuses production without PostgreSQL (SQLite opt-in: %s)', optIn => {
    const result = run(selection, {
      NODE_ENV: 'production', ...(optIn ? { ALLOW_SQLITE_FALLBACK: optIn } : {}),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('PostgreSQL is required in production');
  });

  it.each(['development', 'test'])('does not implicitly select SQLite in %s', NODE_ENV => {
    const result = run(selection, { NODE_ENV });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No database configured');
  });

  it.each(['development', 'test'])('initializes explicitly enabled in-memory SQLite in %s', NODE_ENV => {
    expect(run(`
      const db = await import('./src/config/db.js');
      console.log(JSON.stringify(await db.checkConnection()));
      await db.closePool();
    `, { NODE_ENV, ALLOW_SQLITE_FALLBACK: 'true' }))
      .toEqual({ engine: 'sqlite', connected: true });
  });

  it('rejects malformed URLs without disclosing the URL or switching engines', () => {
    const result = run(selection, { DATABASE_URL: 'invalid-connection-value', ALLOW_SQLITE_FALLBACK: 'true' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid DATABASE_URL');
    expect(result.error).not.toContain('invalid-connection-value');
  });

  it('rejects partial PostgreSQL configuration even with SQLite opt-in', () => {
    const result = run(selection, { DB_NAME: 'unisafe', ALLOW_SQLITE_FALLBACK: 'true' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Incomplete PostgreSQL configuration');
  });

  it.each(['invalid', '0', '65536', '5432.5'])('rejects invalid PostgreSQL port %s', DB_PORT => {
    const result = run(selection, { DB_HOST: 'localhost', DB_PORT });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid DB_PORT');
  });

  it('refuses the SQLite launcher in production before loading the API', () => {
    const result = run("await import('./scripts/start-sqlite.js');", {
      NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/unisafe',
      ALLOW_SQLITE_FALLBACK: 'true',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('SQLite launcher is disabled in production');
  });

  it('keeps PostgreSQL selected after connection failure, even with SQLite enabled', () => {
    expect(run(`
      const { createServer } = await import('node:net');
      // A local socket accepts then terminates; no real database is contacted.
      const server = createServer(socket => socket.destroy());
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      process.env.DB_HOST = '127.0.0.1';
      process.env.DB_PORT = String(server.address().port);
      process.env.DB_CONNECT_TIMEOUT_MS = '1000';
      const db = await import('./src/config/db.js');
      let failed = false;
      try { await db.initializeDatabase(); } catch { failed = true; }
      console.log(JSON.stringify({ failed, engine: db.isPostgres() ? 'postgresql' : 'sqlite' }));
      await db.closePool();
      await new Promise(resolve => server.close(resolve));
    `, { ALLOW_SQLITE_FALLBACK: 'true' }))
      .toEqual({ failed: true, engine: 'postgresql' });
  });
});
