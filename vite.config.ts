import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the built game can be hosted from any sub-folder
  base: './',
  server: { open: true },
});
