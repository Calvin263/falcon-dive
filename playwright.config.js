import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://localhost:8082', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./serve.ps1 -Port 8082',
    url: 'http://localhost:8082',
    reuseExistingServer: !process.env.CI,
  },
});