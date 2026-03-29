// tests/scoreboard.spec.js
// Regression tests for the volleyball scoreboard.
// Covers: scorekeeper UI, game logic, accessibility attributes, and
// real-time sync between the scorekeeper and display pages.

const { test, expect } = require('@playwright/test');

const SK = '/scorekeeper.html';
const DI = '/display.html';

// ── helpers ──────────────────────────────────────────────────────────────────

function freshState() {
  return {
    teamA: { name: 'TEAM A', score: 0, sets: 0 },
    teamB: { name: 'TEAM B', score: 0, sets: 0 },
    serving: 'A',
    currentSet: 1,
    setHistory: [],
    matchOver: false,
    sidesSwapped: false,
  };
}

/** Wait for the Socket.io backend to connect on the scorekeeper page. */
async function waitForSKReady(page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#conn-dot.live', { timeout: 8000 });
}

/** Wait for the display page to receive its first state update. */
async function waitForDisplayReady(page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#no-signal.hidden', { timeout: 8000 });
}

/**
 * Push a fresh state to the server from the given scorekeeper page,
 * then wait for the DOM to reflect it.
 */
async function resetState(page) {
  // Dismiss any overlay left open by a previous test. The ov-btn may call
  // resetMatch() which shows a confirm() dialog — accept it if so.
  if (await page.locator('#overlay.show').count() > 0) {
    page.once('dialog', d => d.accept());
    await page.click('#ov-btn');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  }
  await page.evaluate(s => window.backend.replace(s), freshState());
  // Wait for ALL expected fresh-state values so we don't proceed before
  // the broadcast has been received and rendered (avoids race conditions).
  await expect(page.locator('#score-a')).toHaveText('0');
  await expect(page.locator('#score-b')).toHaveText('0');
  await expect(page.locator('#set-num')).toHaveText('1');
  await expect(page.locator('#name-a')).toHaveText('TEAM A');
}

// ── Scorekeeper: initial state ────────────────────────────────────────────────

test.describe('Scorekeeper — initial state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await resetState(page);
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
    await resetState(page);
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
    await page.evaluate(() => window.backend.update({ 'teamA/score': 5 }));
    await expect(page.locator('#score-a')).toHaveText('5');
    await page.click('#panel-a .btn-minus');
    await expect(page.locator('#score-a')).toHaveText('4');
  });

  test('removes a point from Team B', async ({ page }) => {
    await page.evaluate(() => window.backend.update({ 'teamB/score': 3 }));
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

// ── Scorekeeper: serve toggle ─────────────────────────────────────────────────

test.describe('Scorekeeper — serve toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await resetState(page);
  });

  test('toggle serve button switches serving team', async ({ page }) => {
    await expect(page.locator('#panel-a')).toHaveClass(/serving/);
    await page.click('[aria-label="Toggle serve"]');
    await expect(page.locator('#panel-b')).toHaveClass(/serving/);
    await expect(page.locator('#panel-a')).not.toHaveClass(/serving/);
  });

  test('toggling serve twice returns to original team', async ({ page }) => {
    await page.click('[aria-label="Toggle serve"]');
    await page.click('[aria-label="Toggle serve"]');
    await expect(page.locator('#panel-a')).toHaveClass(/serving/);
  });
});

// ── Scorekeeper: team name editing ────────────────────────────────────────────

test.describe('Scorekeeper — team name editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await resetState(page);
  });

  test('clicking a team name shows an inline input', async ({ page }) => {
    await page.click('#name-a');
    await expect(page.locator('.name-input')).toBeVisible();
  });

  test('Enter saves the new name', async ({ page }) => {
    await page.click('#name-a');
    await page.locator('.name-input').fill('SPIKES FC');
    await page.locator('.name-input').press('Enter');
    await expect(page.locator('#name-a')).toHaveText('SPIKES FC');
  });

  test('name is always stored uppercased', async ({ page }) => {
    await page.click('#name-a');
    await page.locator('.name-input').fill('spikes fc');
    await page.locator('.name-input').press('Enter');
    await expect(page.locator('#name-a')).toHaveText('SPIKES FC');
  });

  test('Escape cancels the edit', async ({ page }) => {
    await page.click('#name-a');
    await page.locator('.name-input').fill('SHOULD NOT SAVE');
    await page.locator('.name-input').press('Escape');
    await expect(page.locator('#name-a')).toHaveText('TEAM A');
  });

  test('blurring the input saves the name', async ({ page }) => {
    await page.click('#name-a');
    await page.locator('.name-input').fill('HURRICANES');
    // Click elsewhere to blur
    await page.locator('#score-a').click();
    await expect(page.locator('#name-a')).toHaveText('HURRICANES');
  });

  test('can edit Team B name independently', async ({ page }) => {
    await page.click('#name-b');
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
    await resetState(page);
  });

  test('no set win at 25 without a 2-point lead', async ({ page }) => {
    await page.evaluate(() => window.backend.update({ 'teamA/score': 24, 'teamB/score': 24 }));
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('25');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  });

  test('set won at 25 with a 2-point lead', async ({ page }) => {
    await page.evaluate(() => window.backend.update({ 'teamA/score': 24, 'teamB/score': 22 }));
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set won when extending beyond 25 (e.g. 27-25)', async ({ page }) => {
    await page.evaluate(() => window.backend.update({ 'teamA/score': 26, 'teamB/score': 25 }));
    await expect(page.locator('#score-a')).toHaveText('26');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set 5 target label shows 15', async ({ page }) => {
    await page.evaluate(s => window.backend.replace(s), {
      ...freshState(),
      currentSet: 5,
      teamA: { name: 'TEAM A', score: 0, sets: 2 },
      teamB: { name: 'TEAM B', score: 0, sets: 2 },
    });
    await expect(page.locator('#set-num')).toHaveText('5');
    await expect(page.locator('#target-label')).toContainText('15');
  });

  test('set 5 won at 15 with a 2-point lead', async ({ page }) => {
    await page.evaluate(s => window.backend.replace(s), {
      ...freshState(),
      currentSet: 5,
      teamA: { name: 'TEAM A', score: 14, sets: 2 },
      teamB: { name: 'TEAM B', score: 12, sets: 2 },
    });
    await expect(page.locator('#score-a')).toHaveText('14');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set 5 not won at 15-14 (no 2-point lead)', async ({ page }) => {
    await page.evaluate(s => window.backend.replace(s), {
      ...freshState(),
      currentSet: 5,
      teamA: { name: 'TEAM A', score: 14, sets: 2 },
      teamB: { name: 'TEAM B', score: 14, sets: 2 },
    });
    await expect(page.locator('#score-a')).toHaveText('14');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('15');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  });

  test('winning 3 sets shows match-won overlay', async ({ page }) => {
    await page.evaluate(s => window.backend.replace(s), {
      ...freshState(),
      currentSet: 3,
      teamA: { name: 'TEAM A', score: 24, sets: 2 },
      teamB: { name: 'TEAM B', score: 20, sets: 0 },
    });
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    await expect(page.locator('#ov-label')).toContainText('Match');
  });

  test('set history is recorded after a set win', async ({ page }) => {
    await page.evaluate(s => window.backend.replace(s), {
      ...freshState(),
      teamA: { name: 'TEAM A', score: 24, sets: 0 },
      teamB: { name: 'TEAM B', score: 20, sets: 0 },
    });
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    await page.click('#ov-btn');
    await expect(page.locator('#hist-a')).toContainText('25');
    await expect(page.locator('#hist-b')).toContainText('20');
  });

  test('next set button resets scores and increments set number', async ({ page }) => {
    await page.evaluate(() => window.backend.update({ 'teamA/score': 7, 'teamB/score': 5 }));
    await expect(page.locator('#score-a')).toHaveText('7');
    await page.click('button:has-text("Next Set")');
    await expect(page.locator('#score-a')).toHaveText('0');
    await expect(page.locator('#score-b')).toHaveText('0');
    await expect(page.locator('#set-num')).toHaveText('2');
  });

  test('reset match restores fresh state', async ({ page }) => {
    await page.evaluate(() => window.backend.update({ 'teamA/score': 12, 'teamB/score': 9 }));
    await expect(page.locator('#score-a')).toHaveText('12');
    page.once('dialog', d => d.accept());
    await page.click('button:has-text("Reset Match")');
    await expect(page.locator('#score-a')).toHaveText('0');
    await expect(page.locator('#score-b')).toHaveText('0');
    await expect(page.locator('#set-num')).toHaveText('1');
  });

  test('reset match can be cancelled', async ({ page }) => {
    await page.evaluate(() => window.backend.update({ 'teamA/score': 12 }));
    await expect(page.locator('#score-a')).toHaveText('12');
    page.once('dialog', d => d.dismiss());
    await page.click('button:has-text("Reset Match")');
    await expect(page.locator('#score-a')).toHaveText('12');
  });
});

// ── Scorekeeper: swap teams ───────────────────────────────────────────────────

test.describe('Scorekeeper — swap teams', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await resetState(page);
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
    const sk = await ctx.newPage();
    const di = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await resetState(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);

    await sk.click('#panel-a .btn-plus');
    await sk.click('#panel-a .btn-plus');
    await sk.click('#panel-a .btn-plus');

    await expect(di.locator('#score-a')).toHaveText('3');
    await expect(di.locator('#score-b')).toHaveText('0');

    await ctx.close();
  });

  test('team name change appears on display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk = await ctx.newPage();
    const di = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await resetState(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);

    await sk.click('#name-a');
    await sk.locator('.name-input').fill('HURRICANES');
    await sk.locator('.name-input').press('Enter');

    await expect(di.locator('#name-a')).toHaveText('HURRICANES');

    await ctx.close();
  });

  test('serving indicator syncs to display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk = await ctx.newPage();
    const di = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await resetState(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);

    // A is serving; toggle to B
    await sk.click('[aria-label="Toggle serve"]');

    await expect(di.locator('#team-b')).toHaveClass(/serving/);
    await expect(di.locator('#team-a')).not.toHaveClass(/serving/);

    await ctx.close();
  });

  test('set number updates on display after Next Set', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk = await ctx.newPage();
    const di = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await resetState(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);

    await sk.click('button:has-text("Next Set")');

    await expect(di.locator('#set-label')).toHaveText('SET 2');

    await ctx.close();
  });

  test('celebration overlay shows on display when a set is won', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk = await ctx.newPage();
    const di = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await resetState(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);

    await sk.evaluate(s => window.backend.replace(s), {
      ...freshState(),
      teamA: { name: 'TEAM A', score: 24, sets: 0 },
      teamB: { name: 'TEAM B', score: 22, sets: 0 },
    });
    await expect(sk.locator('#score-a')).toHaveText('24');

    await sk.click('#panel-a .btn-plus');

    await expect(di.locator('#celebration')).toHaveClass(/show/, { timeout: 5000 });

    await ctx.close();
  });

  test('reset match clears scores on display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk = await ctx.newPage();
    const di = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    await resetState(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);

    await sk.evaluate(() => window.backend.update({ 'teamA/score': 15, 'teamB/score': 10 }));
    await expect(di.locator('#score-a')).toHaveText('15');

    sk.once('dialog', d => d.accept());
    await sk.click('button:has-text("Reset Match")');

    await expect(di.locator('#score-a')).toHaveText('0');
    await expect(di.locator('#score-b')).toHaveText('0');

    await ctx.close();
  });
});

// ── Accessibility attributes ──────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    await resetState(page);
  });

  test('score elements have aria-label with team name and value', async ({ page }) => {
    await expect(page.locator('#score-a')).toHaveAttribute('aria-label', /Team A score/i);
    await expect(page.locator('#score-b')).toHaveAttribute('aria-label', /Team B score/i);
  });

  test('add/remove buttons have aria-label containing team name', async ({ page }) => {
    // aria-labels are set dynamically by render() using the uppercased team name from state
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
    await page.click('#name-a');
    await expect(page.locator('.name-input')).toHaveAttribute('aria-label', /Team A/i);
  });

  test('aria-labels update when team name changes', async ({ page }) => {
    await page.click('#name-a');
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

  test('connection dot has role=img and aria-label', async ({ page }) => {
    await expect(page.locator('#conn-dot')).toHaveAttribute('role', 'img');
    await expect(page.locator('#conn-dot')).toHaveAttribute('aria-label', 'Connected');
  });
});
