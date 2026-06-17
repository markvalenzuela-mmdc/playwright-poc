/// <reference types="node" />
import { loadEnvFile } from 'node:process';
import { defineConfig, devices } from '@playwright/test';

try {
  loadEnvFile('.env');
} catch {
  // Optional: allow running even when .env is absent.
}

export default defineConfig({
  testDir: './tests',
  testMatch: ['homepage.monitor.spec.ts', 'critical-paths.monitor.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['line'],
    [
      './reporters/db-reporter.ts',
      {
        connectionString: process.env.DATABASE_URL,
      },
    ],
  ],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.TARGET_BASE_URL ?? 'https://www.mmdc.mcl.edu.ph/',
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
  ],
});
