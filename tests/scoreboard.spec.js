// tests/scoreboard.spec.js
// Regression tests for the volleyball scoreboard.
// Covers: scorekeeper UI, game logic, accessibility attributes, and
// real-time sync between the scorekeeper and display pages.
//
// Architecture notes:
//   - The app uses a multi-match system. Tests create a dedicated test match
//     (TEST_ID) and navigate the scorekeeper to the scorer view before testing.
//   - Backend API: backend.replaceMatch(id, state) / backend.updateMatch(id, patch)
//   - Display tests must call openMatch(id) to show a specific match's scoreboard.

const { test, expect } = require('@playwright/test');

const SK = '/scorekeeper.html';
const DI = '/display.html';
const TEST_ID = 'playwright_test_match';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a complete match state object for the test match.
 * Pass overrides for teamA / teamB as objects (they are shallow-merged).
 * All other top-level fields can be overridden directly.
 */
function freshMatchState(overrides = {}) {
  const base = {
    id:           TEST_ID,
    venue:        'Test Court',
    scheduledAt:  new Date().toISOString(),
    started:      true,
    matchOver:    false,
    currentSet:   1,
    setHistory:   [],
    serving:      'A',
    sidesSwapped: false,
    teamA: { name: 'TEAM A', score: 0, sets: 0 },
    teamB: { name: 'TEAM B', score: 0, sets: 0 },
  };
  const result = { ...base, ...overrides };
  if (overrides.teamA) result.teamA = { ...base.teamA, ...overrides.teamA };
  if (overrides.teamB) result.teamB = { ...base.teamB, ...overrides.teamB };
  return result;
}

/** Wait for the Socket.io backend to connect on the scorekeeper page. */
async function waitForSKReady(page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#conn-dot.live', { timeout: 8000 });
}

/** Wait for the display page to receive its first state broadcast. */
async function waitForDisplayReady(page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#no-signal.hidden', { timeout: 8000 });
}

/**
 * Push a fresh (or customised) match state to the server from the scorekeeper
 * page, then navigate to the scorer view and wait for the DOM to reflect it.
 *
 * Note: allMatches is a script-level `let` (not window.*), so we can't poll it
 * directly. Instead we navigate to the scorer immediately — openScorer sets
 * activeId so that the next onMatches broadcast triggers renderScorer — then
 * rely on Playwright's built-in assertion retrying to wait for the DOM.
 */
async function setupTestMatch(page, overrides = {}) {
  const state = freshMatchState(overrides);

  // Dismiss any open overlay without triggering navigation side-effects
  await page.evaluate(() => {
    if (typeof window.dismissOverlay === 'function') window.dismissOverlay();
  });

  // Push the state to the server, navigate to scorer, and wait for the
  // replaceMatch broadcast to arrive before returning.
  // We return a Promise so page.evaluate doesn't resolve until the broadcast
  // has been processed by the onMatches handler and renderScorer has run.
  await page.evaluate(([id, s]) => new Promise(resolve => {
    // One-shot listener: resolve as soon as the broadcast with our match arrives.
    // Also dismiss any overlay that openScorer may have shown by rendering the
    // previous (stale) match state — e.g. if the last test left matchOver:true.
    window.backend.onMatches(data => {
      if (data[id]) {
        if (typeof window.dismissOverlay === 'function') window.dismissOverlay();
        resolve();
      }
    });
    window.backend.replaceMatch(id, s);
    window.openScorer(id);  // switches view; re-renders on broadcast
    setTimeout(resolve, 3000); // safety fallback
  }), [TEST_ID, state]);

  // Broadcast has arrived; DOM should now reflect the pushed state exactly
  await expect(page.locator('#view-scorer')).toHaveClass(/active/);
  await expect(page.locator('#score-a')).toHaveText(String(state.teamA.score));
  await expect(page.locator('#score-b')).toHaveText(String(state.teamB.score));
  await expect(page.locator('#set-num')).toHaveText(String(state.currentSet));
}

/**
 * Open the test match on the display's scoreboard view.
 * Call after waitForDisplayReady — the initial socket broadcast already contains
 * the test match, so openMatch can be called immediately.
 */
async function openMatchOnDisplay(page) {
  // openMatch is a function declaration → accessible as window.openMatch
  await page.evaluate(id => window.openMatch(id), TEST_ID);
  await page.waitForSelector('#view-score.active', { timeout: 5000 });
}

// ── Scorekeeper: initial state ────────────────────────────────────────────────

test.describe('Scorekeeper — initial state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await setupTestMatch(page);
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

// ── Scorekeeper: scoring ──────────────────────────────────────────────────────

test.describe('Scorekeeper — scoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await setupTestMatch(page);
  });

  test('adds a point to Team A', async ({ page }) => {
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('1');
    await expect(page.locator('#score-b')).toHaveText('0');
  });

  test('adds a point to Team B', async ({ page }) => {
    await page.click('#panel-b .btn-plus');
    await expect(page.locator('#score-b')).toHaveText('1');
    await expect(page.locator('#score-a')).toHaveText('0');
  });

  test('removes a point from Team A', async ({ page }) => {
    await page.evaluate(([id]) => window.backend.updateMatch(id, { 'teamA/score': 5 }), [TEST_ID]);
    await expect(page.locator('#score-a')).toHaveText('5');
    await page.click('#panel-a .btn-minus');
    await expect(page.locator('#score-a')).toHaveText('4');
  });

  test('removes a point from Team B', async ({ page }) => {
    await page.evaluate(([id]) => window.backend.updateMatch(id, { 'teamB/score': 3 }), [TEST_ID]);
    await expect(page.locator('#score-b')).toHaveText('3');
    await page.click('#panel-b .btn-minus');
    await expect(page.locator('#score-b')).toHaveText('2');
  });

  test('score cannot go below 0', async ({ page }) => {
    await page.click('#panel-a .btn-minus');
    await expect(page.locator('#score-a')).toHaveText('0');
    await page.click('#panel-b .btn-minus');
    await expect(page.locator('#score-b')).toHaveText('0');
  });

  test('scoring gives serve to the scoring team', async ({ page }) => {
    // Team A starts serving; Team B scores → serve moves to B
    await page.click('#panel-b .btn-plus');
    await expect(page.locator('#panel-b')).toHaveClass(/serving/);
    await expect(page.locator('#panel-a')).not.toHaveClass(/serving/);
  });

  test('scoring keeps serve with scoring team on consecutive points', async ({ page }) => {
    await page.click('#panel-a .btn-plus');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#panel-a')).toHaveClass(/serving/);
  });
});

// ── Scorekeeper: team name editing ────────────────────────────────────────────

test.describe('Scorekeeper — team name editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await setupTestMatch(page);
  });

  test('clicking a team name shows an inline input', async ({ page }) => {
    // Use dispatchEvent to avoid Chromium's mousedown→focus→blur race when the
    // focused button is removed from the DOM by editName's replaceWith().
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
    // Click elsewhere to blur
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

// ── Scorekeeper: set and match logic ──────────────────────────────────────────

test.describe('Scorekeeper — set logic', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await setupTestMatch(page);
  });

  test('no set win at 25 without a 2-point lead', async ({ page }) => {
    await setupTestMatch(page, { teamA: { score: 24 }, teamB: { score: 24 } });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('25');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  });

  test('set won at 25 with a 2-point lead', async ({ page }) => {
    await setupTestMatch(page, { teamA: { score: 24 }, teamB: { score: 22 } });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set won when extending beyond 25 (e.g. 27-25)', async ({ page }) => {
    await setupTestMatch(page, { teamA: { score: 26 }, teamB: { score: 25 } });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set 5 target label shows "first to 15"', async ({ page }) => {
    await setupTestMatch(page, {
      currentSet: 5,
      teamA: { score: 0, sets: 2 },
      teamB: { score: 0, sets: 2 },
    });
    await expect(page.locator('#set-num')).toHaveText('5');
    await expect(page.locator('#target-label')).toContainText('15');
  });

  test('set 5 won at 15 with a 2-point lead', async ({ page }) => {
    await setupTestMatch(page, {
      currentSet: 5,
      teamA: { score: 14, sets: 2 },
      teamB: { score: 12, sets: 2 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set 5 not won at 15-14 (no 2-point lead)', async ({ page }) => {
    await setupTestMatch(page, {
      currentSet: 5,
      teamA: { score: 14, sets: 2 },
      teamB: { score: 14, sets: 2 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('15');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  });

  test('winning 3 sets shows match-won overlay', async ({ page }) => {
    await setupTestMatch(page, {
      currentSet: 3,
      teamA: { score: 24, sets: 2 },
      teamB: { score: 20, sets: 0 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    await expect(page.locator('#ov-label')).toContainText('Match');
  });

  test('set history is recorded after a set win', async ({ page }) => {
    await setupTestMatch(page, {
      teamA: { score: 24, sets: 0 },
      teamB: { score: 20, sets: 0 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    // Dismiss overlay via the "Next Set" overlay button
    await page.click('#ov-btn');
    await expect(page.locator('#hist-a')).toContainText('25');
    await expect(page.locator('#hist-b')).toContainText('20');
  });

  test('next set button resets scores and increments set number', async ({ page }) => {
    await page.evaluate(([id]) => window.backend.updateMatch(id, { 'teamA/score': 7, 'teamB/score': 5 }), [TEST_ID]);
    await expect(page.locator('#score-a')).toHaveText('7');
    await page.click('button:has-text("Next Set")');
    await expect(page.locator('#score-a')).toHaveText('0');
    await expect(page.locator('#score-b')).toHaveText('0');
    await expect(page.locator('#set-num')).toHaveText('2');
  });

  test('end match with confirmation returns to list view', async ({ page }) => {
    page.once('dialog', d => d.accept());
    await page.click('button:has-text("End Match")');
    await expect(page.locator('#view-list')).toHaveClass(/active/);
  });

  test('end match cancelled stays on scorer', async ({ page }) => {
    page.once('dialog', d => d.dismiss());
    await page.click('button:has-text("End Match")');
    await expect(page.locator('#view-scorer')).toHaveClass(/active/);
  });
});

// ── Scorekeeper: swap teams ───────────────────────────────────────────────────

test.describe('Scorekeeper — swap teams', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await setupTestMatch(page);
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

// ── Real-time sync: scorekeeper → display ─────────────────────────────────────

test.describe('Real-time sync', () => {
  test('score update on scorekeeper appears on display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk  = await ctx.newPage();
    const di  = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await setupTestMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di);

    await sk.click('#panel-a .btn-plus');
    await sk.click('#panel-a .btn-plus');
    await sk.click('#panel-a .btn-plus');

    await expect(di.locator('#score-a')).toHaveText('3');
    await expect(di.locator('#score-b')).toHaveText('0');

    await ctx.close();
  });

  test('team name change appears on display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk  = await ctx.newPage();
    const di  = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await setupTestMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di);

    await sk.locator('#name-a').dispatchEvent('click');
    await sk.locator('.name-input').fill('HURRICANES');
    await sk.locator('.name-input').press('Enter');

    await expect(di.locator('#name-a')).toHaveText('HURRICANES');

    await ctx.close();
  });

  test('serving indicator syncs to display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk  = await ctx.newPage();
    const di  = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await setupTestMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di);

    // A is serving; B scores → serve moves to B
    await sk.click('#panel-b .btn-plus');

    await expect(di.locator('#team-b')).toHaveClass(/serving/);
    await expect(di.locator('#team-a')).not.toHaveClass(/serving/);

    await ctx.close();
  });

  test('set number updates on display after Next Set', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk  = await ctx.newPage();
    const di  = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await setupTestMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di);

    await sk.click('button:has-text("Next Set")');

    await expect(di.locator('#set-label')).toHaveText('SET 2');

    await ctx.close();
  });

  test('celebration overlay shows on display when a set is won', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk  = await ctx.newPage();
    const di  = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await setupTestMatch(sk, {
      teamA: { score: 24, sets: 0 },
      teamB: { score: 22, sets: 0 },
    });

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di);

    await sk.click('#panel-a .btn-plus');

    await expect(di.locator('#celebration')).toHaveClass(/show/, { timeout: 5000 });

    await ctx.close();
  });
});

// ── Accessibility attributes ──────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await setupTestMatch(page);
  });

  test('score elements have aria-label', async ({ page }) => {
    await expect(page.locator('#score-a')).toHaveAttribute('aria-label', /Team A score/i);
    await expect(page.locator('#score-b')).toHaveAttribute('aria-label', /Team B score/i);
  });

  test('add/remove buttons have aria-label', async ({ page }) => {
    await expect(page.locator('#panel-a .btn-plus')).toHaveAttribute('aria-label', /Team A/i);
    await expect(page.locator('#panel-a .btn-minus')).toHaveAttribute('aria-label', /Team A/i);
    await expect(page.locator('#panel-b .btn-plus')).toHaveAttribute('aria-label', /Team B/i);
    await expect(page.locator('#panel-b .btn-minus')).toHaveAttribute('aria-label', /Team B/i);
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

  test('team name button aria-label updates when name changes', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await page.locator('.name-input').fill('RAPTORS');
    await page.locator('.name-input').press('Enter');
    // renderScorer sets aria-label on the name button after the state round-trip
    await expect(page.locator('#name-a')).toHaveAttribute('aria-label', /RAPTORS/i);
  });

  test('connection dot has aria-label reflecting connection state', async ({ page }) => {
    await expect(page.locator('#conn-dot')).toHaveAttribute('aria-label', 'Connected');
  });
});
