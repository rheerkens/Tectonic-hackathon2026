import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `bun run dev` sets API_PORT; running `vite` by hand falls back to the API default.
const apiPort = process.env.API_PORT ?? '3001';
const apiTarget = `http://127.0.0.1:${apiPort}`;

// When launched by the dev launcher, exit if it disappears (prevents orphaned Vite processes).
const launcherPid = Number(process.env.DEV_LAUNCHER_PID);
if (launcherPid > 0) {
  setInterval(() => {
    if (process.ppid !== launcherPid) process.exit(0);
  }, 2_000);
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
