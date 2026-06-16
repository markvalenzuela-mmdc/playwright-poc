import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/enrollmate',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report-enrollmate', open: 'never' }],
  ],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'https://uat.enrollmate.mmdc.mcl.edu.ph',
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'enrollmate-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'enrollmate-firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'enrollmate-webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
