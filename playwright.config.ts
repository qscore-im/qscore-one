import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 15000 },
  workers: 4,
  retries: 1,
  reporter: 'list',

  webServer: {
    command: 'PORT=3000 node server.js',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },

  projects: [
    // ── Laptop / desktop ─────────────────────────────────────────────────────
    // Full test suite including all sync (multi-page) tests.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },

    // ── Phone (scorekeeper primary target) ────────────────────────────────────
    // Scorekeeper + accessibility at mobile viewport.
    // Sync tests excluded — already covered by chromium/webkit desktop.
    {
      name: 'iphone',
      testMatch: ['**/scorekeeper.spec.ts', '**/scoring.spec.ts', '**/scorekeeper-accessibility.spec.ts'],
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'android',
      testMatch: ['**/scorekeeper.spec.ts', '**/scoring.spec.ts', '**/scorekeeper-accessibility.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },

    // ── Tablet (display + quick scorekeeper) ─────────────────────────────────
    // Display keyboard nav + quickscores UI at tablet viewport.
    // Multi-page sync tests excluded — covered by desktop projects.
    {
      name: 'ipad',
      testMatch: ['**/display-keyboard.spec.ts', '**/quick.spec.ts'],
      use: { ...devices['iPad Pro 11'] },
    },
    {
      name: 'android-tab',
      testMatch: ['**/display-keyboard.spec.ts', '**/quick.spec.ts'],
      use: { ...devices['Galaxy Tab S9'] },
    },

    // ── Android TV ───────────────────────────────────────────────────────────
    // 1080p Chrome, no touch — keyboard navigation is the primary concern.
    // Multi-page sync tests excluded — covered by desktop projects.
    {
      name: 'android-tv',
      testMatch: ['**/display-keyboard.spec.ts', '**/quick.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        hasTouch:  false,
        isMobile:  false,
      },
    },
  ],
});
