import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

function flattenHtmlOutputs() {
  return {
    name: 'flatten-html-outputs',
    closeBundle() {
      mkdirSync('dist/login', { recursive: true });
      mkdirSync('dist/dashboard', { recursive: true });
      copyFileSync('dist/src/landing/index.html', 'dist/index.html');
      copyFileSync('dist/src/login/index.html', 'dist/login/index.html');
      copyFileSync('dist/src/dashboard/index.html', 'dist/dashboard/index.html');
    },
  };
}

export default defineConfig({
  plugins: [preact(), flattenHtmlOutputs()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'src/landing/index.html'),
        login: resolve(__dirname, 'src/login/index.html'),
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
