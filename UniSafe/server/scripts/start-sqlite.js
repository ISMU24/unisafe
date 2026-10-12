import 'dotenv/config';

if (process.env.NODE_ENV === 'production') {
  throw new Error('SQLite launcher is disabled in production. Start the server with PostgreSQL using npm start.');
}

// Explicit development/test mode for this process only, after loading .env.
// Empty values also prevent index.js's dotenv import from restoring PostgreSQL.
// Keep SQLITE_PATH, PORT, JWT secrets, CORS and all other settings unchanged.
for (const name of ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_DATABASE', 'DB_USER', 'DB_USERNAME', 'DB_PASSWORD']) {
  process.env[name] = '';
}
process.env.ALLOW_SQLITE_FALLBACK = 'true';

console.log('Explicit SQLite development/test mode. Production and demos require PostgreSQL.');

// Database selection happens at module evaluation, so import only after the
// overrides above. A static import would select the database too early.
await import('../index.js');
