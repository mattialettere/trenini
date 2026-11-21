import { defineConfig } from 'vite';

// base relativo: il sito funziona sia su GitHub Pages (/trenini/) sia in locale.
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
