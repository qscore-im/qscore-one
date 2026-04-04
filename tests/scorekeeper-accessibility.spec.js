// tests/scorekeeper-accessibility.spec.js
// Accessibility attribute tests for the scorekeeper UI.

const { test, expect } = require('@playwright/test');
const {
  SK,
  waitForSKReady,
  createAndOpenMatch,
} = require('./helpers');

// ── Accessibility attributes ──────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await createAndOpenMatch(page);
  });

  test('score elements have aria-label with team name and value', async ({ page }) => {
    await expect(page.locator('#score-a')).toHaveAttribute('aria-label', /Team A score/i);
    await expect(page.locator('#score-b')).toHaveAttribute('aria-label', /Team B score/i);
  });

  test('add/remove buttons have aria-label containing team name', async ({ page }) => {
    await expect(page.locator('#panel-a .btn-plus')).toHaveAttribute('aria-label', /TEAM A/);
    await expect(page.locator('#panel-a .btn-minus')).toHaveAttribute('aria-label', /TEAM A/);
    await expect(page.locator('#panel-b .btn-plus')).toHaveAttribute('aria-label', /TEAM B/);
    await expect(page.locator('#panel-b .btn-minus')).toHaveAttribute('aria-label', /TEAM B/);
  });

  test('team name elements are buttons', async ({ page }) => {
    await expect(page.locator('#name-a')).toHaveRole('button');
    await expect(page.locator('#name-b')).toHaveRole('button');
  });

  test('toast element has aria-live', async ({ page }) => {
    await expect(page.locator('#toast')).toHaveAttribute('aria-live', 'polite');
  });

  test('overlay has role=dialog and aria-modal', async ({ page }) => {
    await expect(page.locator('#overlay')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#overlay')).toHaveAttribute('aria-modal', 'true');
  });

  test('inline name input has aria-label', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await expect(page.locator('.name-input')).toHaveAttribute('aria-label', /Team A/i);
  });

  test('aria-labels update when team name changes', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await page.locator('.name-input').fill('RAPTORS');
    await page.locator('.name-input').press('Enter');
    await expect(page.locator('#score-a')).toHaveAttribute('aria-label', /RAPTORS/i);
    await expect(page.locator('[aria-label*="RAPTORS"]').first()).toBeVisible();
  });

  test('serving state is conveyed in sr-only text, not color only', async ({ page }) => {
    await expect(page.locator('#serve-a')).toHaveText('(serving)');
    await expect(page.locator('#serve-b')).toHaveText('');
    await page.click('[aria-label="Toggle serve"]');
    await expect(page.locator('#serve-b')).toHaveText('(serving)');
    await expect(page.locator('#serve-a')).toHaveText('');
  });

  test('sets-won container has aria-label', async ({ page }) => {
    await expect(page.locator('#sets-a')).toHaveAttribute('aria-label', /sets won/i);
    await expect(page.locator('#sets-b')).toHaveAttribute('aria-label', /sets won/i);
  });

  test('connection dot in scorer view has role=img and aria-label Connected', async ({ page }) => {
    // Tests run in the scorer view; check the scorer header's conn-dot
    await expect(page.locator('#conn-dot-scorer')).toHaveAttribute('role', 'img');
    await expect(page.locator('#conn-dot-scorer')).toHaveAttribute('aria-label', 'Connected');
  });
});
