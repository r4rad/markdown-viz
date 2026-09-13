import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@markdown-viz/domain': resolve(__dirname, 'packages/domain/src/index.ts'),
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
  worker: {
    format: 'es',
  },
  optimizeDeps: {
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Cap parallelism to avoid Windows pool-start timeouts under load
    maxWorkers: 4,
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/vite-env.d.ts'],
    },
  },
});
