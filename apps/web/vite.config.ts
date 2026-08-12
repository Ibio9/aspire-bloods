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
    rollupOptions: {
      output: {
        /**
         * ONE VENDOR CHUNK, AND ONLY FOR THINGS EVERY SCREEN NEEDS.
         *
         * React, the DOM renderer and the router are on every route, so they
         * would otherwise be inlined into the entry chunk and re-downloaded in
         * full every time any application code changes. Split out, they are a
         * long-lived cache entry that a deploy does not invalidate.
         *
         * NOTHING ELSE IS LISTED HERE ON PURPOSE. Rollup already gives each
         * dynamic import its own chunk and hoists what several of them share —
         * naming a package here would OVERRIDE that and pull it back into a
         * chunk the entry depends on, which is exactly how a manual chunk map
         * quietly undoes a lazy boundary. recharts in particular must stay
         * unlisted: it is 386 kB with its dependency tree and belongs only to
         * the two screens that draw a chart.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
