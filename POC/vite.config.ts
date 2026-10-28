import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: './client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/assets': 'http://localhost:3001',
      '/renders': 'http://localhost:3001',
    },
  },
  build: {
    outDir: '../dist/client',
    assetsDir: 'client-assets',
    emptyOutDir: true,
  },
});
