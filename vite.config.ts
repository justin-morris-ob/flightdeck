import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { target: 'esnext', outDir: 'dist/web', emptyOutDir: true },
});
