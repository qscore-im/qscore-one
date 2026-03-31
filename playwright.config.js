const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 20000,
  expect: { timeout: 8000 },
  workers: 1,           // tests share server state — run serially
  reporter: 'list',

  webServer: {
    command: 'PORT=3001 node server.js',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },

  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
});
