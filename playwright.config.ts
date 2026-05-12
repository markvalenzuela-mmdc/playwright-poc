/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results' }],
  ],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'https://www.mmdc.mcl.edu.ph/',
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-core',
      use: { ...devices['Desktop Chrome'] },
      grep: /@core/,
    },
    {
      name: 'chromium-crossbrowser',
      use: { ...devices['Desktop Chrome'] },
      grep: /@crossbrowser/,
    },
    {
      name: 'firefox-crossbrowser',
      use: { ...devices['Desktop Firefox'] },
      grep: /@crossbrowser/,
    },
    {
      name: 'webkit-crossbrowser',
      use: { ...devices['Desktop Safari'] },
      grep: /@crossbrowser/,
    },
  ],
});
