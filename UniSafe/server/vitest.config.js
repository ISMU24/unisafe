import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: false, // Tests must never load local .env files.
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
    globals: true,
    // Keep the live-server test's fixed port isolated from other test files.
    fileParallelism: false,
    pool: 'forks',
  },
});
