import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SIDECAR = process.env.BEADVIZ_SIDECAR ?? 'http://127.0.0.1:5177';

export default defineConfig({
  plugins: [react()],
  server: {
    // Same reasoning as the sidecar: this thing has no business on a LAN.
    host: '127.0.0.1',
    port: 5178,
    proxy: {
      '/api': { target: SIDECAR, changeOrigin: false },
      '/avatars': { target: SIDECAR, changeOrigin: false },
    },
  },
  worker: { format: 'es' },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 900 },
});
