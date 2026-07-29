import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        pet: resolve(import.meta.dirname, 'index.html'),
        management: resolve(import.meta.dirname, 'management.html')
      }
    }
  }
});
