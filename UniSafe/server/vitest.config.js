import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
    globals: true,
    // Every test file shares one file-based SQLite database and truncates its
    // tables in beforeEach, so files must not run concurrently.
    fileParallelism: false,
    pool: 'forks',
  },
});