import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Both overridable so a second checkout of this repo (a git worktree on
// another branch, say) can run its own stack alongside the first instead of
// colliding on 4000/5173. Defaults are unchanged.
const API_TARGET = process.env.DEV_API_TARGET ?? 'http://localhost:4000';
const DEV_PORT = Number(process.env.DEV_WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: DEV_PORT,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
