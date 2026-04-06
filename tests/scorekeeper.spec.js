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

// ── Scorekeeper: code and notes ───────────────────────────────────────────────

test.describe('Scorekeeper — code and notes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
  });

  test('New Match dialog has a notes field', async ({ page }) => {
    await page.click('[aria-label="New match"]');
    await expect(page.locator('#inp-notes')).toBeVisible();
  });

  test('creating a match stores a 5-char alpha code on the card', async ({ page }) => {
    await page.click('[aria-label="New match"]');
    await page.fill('#inp-team-a', 'CODE FC');
    await page.click('.btn-create');
    const card = page.locator('.match-card').filter({ hasText: 'CODE FC' }).first();
    await expect(card).toBeVisible();
    // The code is rendered in monospace — grab the full card text and check for 5 lowercase letters
    const text = await card.textContent();
    expect(text).toMatch(/[a-z]{5}/);
  });

  test('notes entered in dialog appear on the match card', async ({ page }) => {
    await page.click('[aria-label="New match"]');
    await page.fill('#inp-team-a', 'NOTES SIDE A');
    await page.fill('#inp-notes', 'Court 4 division 2');
    await page.click('.btn-create');
    await expect(
      page.locator('.match-card').filter({ hasText: 'Court 4 division 2' }).first()
    ).toBeVisible();
  });

  test('text search filters matches by notes', async ({ page }) => {
    await page.click('[aria-label="New match"]');
    await page.fill('#inp-team-a', 'ALPHA SQUAD');
    await page.fill('#inp-notes', 'premier league');
    await page.click('.btn-create');

    await page.click('[aria-label="New match"]');
    await page.fill('#inp-team-a', 'BETA SQUAD');
    await page.fill('#inp-notes', 'junior division');
    await page.click('.btn-create');

    await page.fill('#filter-text', 'premier');
    await expect(page.locator('.match-card').filter({ hasText: 'ALPHA SQUAD' }).first()).toBeVisible();
    await expect(page.locator('.match-card').filter({ hasText: 'BETA SQUAD' })).toHaveCount(0);
  });

  test('text search filters matches by code', async ({ page }) => {
    // Inject a match with a known code directly via backend
    const id = await page.evaluate(() => {
      const mid = 'test_code_' + Date.now();
      window.backend.createMatch({
        id: mid, code: 'zzzqq',
        venue: 'Test Court', scheduledAt: new Date().toISOString(),
        started: false, matchOver: false, currentSet: 1, setHistory: [],
        serving: 'A', sidesSwapped: false, notes: '',
        teamA: { name: 'CODE SEARCH TEAM', score: 0, sets: 0 },
        teamB: { name: 'OTHER SIDE', score: 0, sets: 0 },
      });
      return mid;
    });
    await page.waitForSelector(`[data-match-id="${id}"]`);

    await page.fill('#filter-text', 'zzzqq');
    await expect(page.locator(`[data-match-id="${id}"]`)).toBeVisible();
  });

  test('detail panel shows the match code', async ({ page }) => {
    const id = await page.evaluate(() => {
      const mid = 'test_det_' + Date.now();
      window.backend.createMatch({
        id: mid, code: 'abcde',
        venue: 'Test Court', scheduledAt: new Date().toISOString(),
        started: false, matchOver: false, currentSet: 1, setHistory: [],
        serving: 'A', sidesSwapped: false, notes: '',
        teamA: { name: 'DETAIL A', score: 0, sets: 0 },
        teamB: { name: 'DETAIL B', score: 0, sets: 0 },
      });
      return mid;
    });
    await page.waitForSelector(`[data-match-id="${id}"]`);
    await page.click(`[data-match-id="${id}"]`);
    try {
      await page.waitForSelector('#detail-panel.show', { timeout: 3000 });
    } catch {
      await page.click(`[data-match-id="${id}"]`);
      await page.waitForSelector('#detail-panel.show', { timeout: 20000 });
    }
    await expect(page.locator('#detail-meta')).toContainText('abcde');
  });

  test('notes edited in detail panel are saved to the backend', async ({ page }) => {
    const id = await page.evaluate(() => {
      const mid = 'test_notedit_' + Date.now();
      window.backend.createMatch({
        id: mid, code: 'xyzab',
        venue: 'Test Court', scheduledAt: new Date().toISOString(),
        started: false, matchOver: false, currentSet: 1, setHistory: [],
        serving: 'A', sidesSwapped: false, notes: '',
        teamA: { name: 'EDIT NOTES A', score: 0, sets: 0 },
        teamB: { name: 'EDIT NOTES B', score: 0, sets: 0 },
      });
      return mid;
    });
    await page.waitForSelector(`[data-match-id="${id}"]`);
    await page.click(`[data-match-id="${id}"]`);
    try {
      await page.waitForSelector('#detail-panel.show', { timeout: 3000 });
    } catch {
      await page.click(`[data-match-id="${id}"]`);
      await page.waitForSelector('#detail-panel.show', { timeout: 20000 });
    }

    await page.fill('#detail-notes', 'Referee: Jones');
    // Close the panel — the 600ms debounce will have fired or fire now,
    // then the backend round-trip will re-render the card with the notes text.
    await page.click('.btn-cancel');
    await expect(
      page.locator(`[data-match-id="${id}"]`).filter({ hasText: 'Referee: Jones' })
    ).toBeVisible({ timeout: 5000 });
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
    await expect(page.locator('#court')).toHaveClass(/swapped/);  // wait for round-trip
    await page.click('[aria-label="Swap team sides"]');
    await expect(page.locator('#court')).not.toHaveClass(/swapped/);
  });
});


