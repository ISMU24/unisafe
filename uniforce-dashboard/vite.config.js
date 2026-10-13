import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveApiBase } from './src/api-config.js';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In dev: proxy /api and /socket.io to the local backend.
  // In production builds (docker-compose dashboard): nginx handles proxying —
  // VITE_API_URL=/ explicitly selects that proxy in the Dockerfile.
  const apiBase = resolveApiBase(env.VITE_API_URL, {
    production: command === 'build', netlify: env.NETLIFY === 'true',
  });
  const apiUrl = apiBase || 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',

      allowedHosts: [
        'enquirer-giggling-cognition.ngrok-free.dev'
      ],
      port: 5173,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/socket.io': {
          target: apiUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
