// tests/scorekeeper.spec.js
// Scorekeeper UI tests: match list, initial state, team name editing, swap teams.

const { test, expect } = require('@playwright/test');
const {
  SK, DI,
  waitForSKReady, waitForDisplayReady,
  createAndOpenMatch,
} = require('./helpers');

// ── Scorekeeper: match list ───────────────────────────────────────────────────

test.describe('Scorekeeper — match list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
  });

  test('shows the match list view on load', async ({ page }) => {
    await expect(page.locator('#view-list')).toHaveClass(/active/);
    await expect(page.locator('#view-scorer')).not.toHaveClass(/active/);
  });

  test('New Match button opens the dialog', async ({ page }) => {
    await page.click('[aria-label="New match"]');
    await expect(page.locator('#dialog-new')).toHaveClass(/show/);
  });

  test('creating a match adds a card to the list', async ({ page }) => {
    await page.click('[aria-label="New match"]');
    await page.fill('#inp-team-a', 'SPIKES FC');
    await page.fill('#inp-team-b', 'BEACH BOMBERS');
    await page.click('.btn-create');
    // Filter to cards containing the new team name (other cards from prior tests may also exist)
    await expect(page.locator('.match-card').filter({ hasText: 'SPIKES FC' }).first()).toBeVisible();
    await expect(page.locator('.match-card').filter({ hasText: 'BEACH BOMBERS' }).first()).toBeVisible();
  });

  test('clicking a match card opens the detail panel', async ({ page }) => {
    await createAndOpenMatch(page);
    await page.click('.btn-back');                         // back to list
    await expect(page.locator('#view-list')).toHaveClass(/active/);
    await page.click('.match-card');
    await expect(page.locator('#detail-panel')).toHaveClass(/show/);
  });

  test('Start Match navigates to scorer view', async ({ page }) => {
    await createAndOpenMatch(page);
    await expect(page.locator('#view-scorer')).toHaveClass(/active/);
  });

  test('← List button returns to match list', async ({ page }) => {
    await createAndOpenMatch(page);
    await page.click('.btn-back');
    await expect(page.locator('#view-list')).toHaveClass(/active/);
  });

    test('deleting a match removes it from the display list', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk  = await ctx.newPage();
    const di  = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    const matchId = await createAndOpenMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);

    // Confirm this specific match card is visible before deleting it
    await expect(di.locator(`[data-match-id="${matchId}"]`)).toBeVisible({ timeout: 5000 });

    await sk.evaluate(([id]) => window.backend.deleteMatch(id), [matchId]);

    // Check that the specific match card is gone (other test matches may still exist)
    await expect(di.locator(`[data-match-id="${matchId}"]`)).toHaveCount(0, { timeout: 5000 });

    await ctx.close();
  });

});

// ── Scorekeeper: initial state ────────────────────────────────────────────────

test.describe('Scorekeeper — initial state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await createAndOpenMatch(page);
  });

  test('shows default scores, set number, and team names', async ({ page }) => {
    await expect(page.locator('#score-a')).toHaveText('0');
    await expect(page.locator('#score-b')).toHaveText('0');
    await expect(page.locator('#name-a')).toHaveText('TEAM A');
    await expect(page.locator('#name-b')).toHaveText('TEAM B');
    await expect(page.locator('#set-num')).toHaveText('1');
    await expect(page.locator('#target-label')).toContainText('25');
  });

  test('Team A is serving at start', async ({ page }) => {
    await expect(page.locator('#panel-a')).toHaveClass(/serving/);
    await expect(page.locator('#panel-b')).not.toHaveClass(/serving/);
  });
});

// ── Scorekeeper: team name editing ────────────────────────────────────────────

test.describe('Scorekeeper — team name editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await createAndOpenMatch(page);
  });

  test('clicking a team name shows an inline input', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await expect(page.locator('.name-input')).toBeVisible();
  });

  test('Enter saves the new name', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await page.locator('.name-input').fill('SPIKES FC');
    await page.locator('.name-input').press('Enter');
    await expect(page.locator('#name-a')).toHaveText('SPIKES FC');
  });

  test('name is always stored uppercased', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await page.locator('.name-input').fill('spikes fc');
    await page.locator('.name-input').press('Enter');
    await expect(page.locator('#name-a')).toHaveText('SPIKES FC');
  });

  test('Escape cancels the edit', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await page.locator('.name-input').fill('SHOULD NOT SAVE');
    await page.locator('.name-input').press('Escape');
    await expect(page.locator('#name-a')).toHaveText('TEAM A');
  });

  test('blurring the input saves the name', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await page.locator('.name-input').fill('HURRICANES');
    await page.locator('#score-a').click();
    await expect(page.locator('#name-a')).toHaveText('HURRICANES');
  });

  test('can edit Team B name independently', async ({ page }) => {
    await page.locator('#name-b').dispatchEvent('click');
    await page.locator('.name-input').fill('RAPTORS');
    await page.locator('.name-input').press('Enter');
    await expect(page.locator('#name-b')).toHaveText('RAPTORS');
    await expect(page.locator('#name-a')).toHaveText('TEAM A');
  });
});

// ── Scorekeeper: swap teams ───────────────────────────────────────────────────

test.describe('Scorekeeper — swap teams', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await createAndOpenMatch(page);
  });

  test('swap button adds swapped class to court', async ({ page }) => {
    await expect(page.locator('#court')).not.toHaveClass(/swapped/);
    await page.click('[aria-label="Swap team sides"]');
    await expect(page.locator('#court')).toHaveClass(/swapped/);
  });

  test('swapping twice returns to original layout', async ({ page }) => {
    await page.click('[aria-label="Swap team sides"]');
    await page.click('[aria-label="Swap team sides"]');
    await expect(page.locator('#court')).not.toHaveClass(/swapped/);
  });
});


