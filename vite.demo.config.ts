import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./demo/consumer/', import.meta.url)),
  plugins: [react()],
  build: { target: 'esnext', outDir: '../../dist/consumer-demo', emptyOutDir: true },
});
