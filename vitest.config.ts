import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'web-react/src/**/*.test.ts',
      'web-react/src/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Baseline global gate; raise incrementally as coverage improvements land.
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 65,
        branches: 50,
      },
      exclude: [
        'node_modules/',
        'src/**/*.test.ts',
        'tests/**/*.test.ts',
      ]
    },
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
