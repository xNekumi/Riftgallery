import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backend,
      '/images': backend,
    },
  },
});
