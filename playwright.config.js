import { defineConfig, devices } from '@playwright/test';

const PORT = 3100; // dedicated port so tests never collide with `npm run dev`
const BASE = `http://localhost:${PORT}`; // keep in sync with BASE_URL in tests/helpers.js

export default defineConfig({
  testDir: 'tests',
  testMatch: ['api/**/*.spec.js', 'e2e/**/*.spec.js'],
  fullyParallel: false, // tests share flights and seats in one database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    ['junit', { outputFile: 'reports/playwright-junit.xml' }],
  ],
  outputDir: 'reports/playwright-artifacts',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Production build: no Vite HMR socket, so a running `npm run dev` can't make pages reload mid-test.
    command: 'npm run build && NODE_ENV=production node --env-file-if-exists=.env server/index.js',
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), BETTER_AUTH_URL: BASE },
  },
});
