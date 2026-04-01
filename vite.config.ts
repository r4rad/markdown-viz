import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ['codemirror', '@codemirror/lang-markdown', '@codemirror/language-data'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
});
