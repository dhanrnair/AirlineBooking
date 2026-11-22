import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    reporters: ['default', 'html', ['junit', { outputFile: 'reports/vitest-junit.xml' }]],
    outputFile: { html: 'reports/vitest-html/index.html' },
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.js'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'reports/coverage',
    },
  },
});
