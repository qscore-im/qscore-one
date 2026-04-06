// tests/quick.spec.js
// Tests for quickscores.html (quick scorekeeper) and quickdisplay.html (quick display).

const { test, expect } = require('@playwright/test');
const { QS, QD, waitForQuickReady, getQuickMatchId } = require('./helpers');

// ── quickscores: session setup ────────────────────────────────────────────────

test.describe('quickscores — session setup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(QS);
    await waitForQuickReady(page);
  });

  test('displays a 5-character lowercase alpha code', async ({ page }) => {
    const code = await getQuickMatchId(page);
    expect(code).toMatch(/^[a-z]{5}$/);
  });

  test('displays a quickdisplay URL containing the match code', async ({ page }) => {
    const code = await getQuickMatchId(page);
    const url  = await page.locator('#display-url').textContent();
    expect(url).toContain('/quickdisplay.html?id=' + code);
  });

  test('copy code button briefly shows Copied!', async ({ page }) => {
    // Stub clipboard so the test works in all browsers without permission prompts
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.resolve();
    });
    await page.click('#btn-copy-code');
    await expect(page.locator('#btn-copy-code')).toHaveText('Copied!');
    await expect(page.locator('#btn-copy-code')).toHaveText('Copy', { timeout: 3000 });
  });

  test('copy link button briefly shows Copied!', async ({ page }) => {
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.resolve();
    });
    await page.click('#btn-copy-url');
    await expect(page.locator('#btn-copy-url')).toHaveText('Copied!');
    await expect(page.locator('#btn-copy-url')).toHaveText('Copy', { timeout: 3000 });
  });
});

// ── quickscores: scoring ──────────────────────────────────────────────────────

test.describe('quickscores — scoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(QS);
    await waitForQuickReady(page);
  });

  test('add point to Team A', async ({ page }) => {
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('1');
    await expect(page.locator('#score-b')).toHaveText('0');
  });

  test('add point to Team B', async ({ page }) => {
    await page.click('#panel-b .btn-plus');
    await expect(page.locator('#score-b')).toHaveText('1');
    await expect(page.locator('#score-a')).toHaveText('0');
  });

  test('remove point from Team A', async ({ page }) => {
    const matchId = await getQuickMatchId(page);
    // Set score directly via backend to avoid rapid-click race conditions
    await page.evaluate(([id]) => window.backend.updateMatch(id, { 'teamA/score': 2 }), [matchId]);
    await expect(page.locator('#score-a')).toHaveText('2');
    await page.click('#panel-a .btn-minus');
    await expect(page.locator('#score-a')).toHaveText('1');
  });

  test('score cannot go below 0', async ({ page }) => {
    await page.click('#panel-a .btn-minus');
    await expect(page.locator('#score-a')).toHaveText('0');
  });

  test('scoring gives serve to the scoring team', async ({ page }) => {
    await page.click('#panel-b .btn-plus');
    await expect(page.locator('#panel-b')).toHaveClass(/serving/);
    await expect(page.locator('#panel-a')).not.toHaveClass(/serving/);
  });

  test('Team A is serving at the start', async ({ page }) => {
    await expect(page.locator('#panel-a')).toHaveClass(/serving/);
    await expect(page.locator('#panel-b')).not.toHaveClass(/serving/);
  });
});

// ── quickscores: team name editing ────────────────────────────────────────────

test.describe('quickscores — team name editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(QS);
    await waitForQuickReady(page);
  });

  test('clicking a team name shows an inline input', async ({ page }) => {
    await page.locator('#name-a').dispatchEvent('click');
    await expect(page.locator('.name-input')).toBeVisible();
  });

  test('Enter saves the new name uppercased', async ({ page }) => {
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

  test('can edit Team B name independently', async ({ page }) => {
    await page.locator('#name-b').dispatchEvent('click');
    await page.locator('.name-input').fill('RAPTORS');
    await page.locator('.name-input').press('Enter');
    await expect(page.locator('#name-b')).toHaveText('RAPTORS');
    await expect(page.locator('#name-a')).toHaveText('TEAM A');
  });
});

// ── quickscores: swap teams ───────────────────────────────────────────────────

test.describe('quickscores — swap teams', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(QS);
    await waitForQuickReady(page);
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

// ── quickscores: set and match logic ──────────────────────────────────────────

test.describe('quickscores — set and match logic', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(QS);
    await waitForQuickReady(page);
  });

  test('set win overlay appears when a team reaches 25 with a 2-point lead', async ({ page }) => {
    const matchId = await getQuickMatchId(page);
    await page.evaluate(([id]) => window.backend.updateMatch(id, {
      'teamA/score': 24, 'teamB/score': 22,
    }), [matchId]);
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/, { timeout: 5000 });
  });

  test('no set win at 25-24 (no 2-point lead)', async ({ page }) => {
    const matchId = await getQuickMatchId(page);
    await page.evaluate(([id]) => window.backend.updateMatch(id, {
      'teamA/score': 24, 'teamB/score': 24,
    }), [matchId]);
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('25');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  });

  test('Next Set button resets scores', async ({ page }) => {
    const matchId = await getQuickMatchId(page);
    await page.evaluate(([id]) => window.backend.updateMatch(id, {
      'teamA/score': 24, 'teamB/score': 22,
    }), [matchId]);
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    await page.click('#ov-btn');
    await expect(page.locator('#score-a')).toHaveText('0');
    await expect(page.locator('#score-b')).toHaveText('0');
  });

  test('match win overlay shows Done button', async ({ page }) => {
    const matchId = await getQuickMatchId(page);
    await page.evaluate(([id]) => window.backend.updateMatch(id, {
      'teamA/score': 24, 'teamB/score': 20,
      'teamA/sets': 2, 'teamB/sets': 0,
    }), [matchId]);
    await expect(page.locator('#score-a')).toHaveText('24');
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/, { timeout: 5000 });
    await expect(page.locator('#ov-btn')).toHaveText('Done');
  });
});

// ── quickdisplay: entry screen ────────────────────────────────────────────────

test.describe('quickdisplay — entry screen', () => {
  test('shows the entry screen when no ?id is in the URL', async ({ page }) => {
    await page.goto(QD);
    await expect(page.locator('#view-entry')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#view-score')).toBeHidden();
  });

  test('entering a code and clicking Watch navigates to ?id=<code>', async ({ page }) => {
    await page.goto(QD);
    await page.fill('#code-input', 'abcde');
    await page.click('.btn-watch');
    await expect(page).toHaveURL(/[?&]id=abcde/);
  });

  test('pressing Enter in the code input navigates', async ({ page }) => {
    await page.goto(QD);
    await page.fill('#code-input', 'xyzab');
    await page.press('#code-input', 'Enter');
    await expect(page).toHaveURL(/[?&]id=xyzab/);
  });

  test('empty code shows an error message', async ({ page }) => {
    await page.goto(QD);
    await page.click('.btn-watch');
    await expect(page.locator('#entry-error')).toHaveText(/please enter/i);
  });
});

// ── quickdisplay: scoreboard view ─────────────────────────────────────────────

test.describe('quickdisplay — scoreboard view', () => {
  test('shows no-signal screen while waiting for an unknown match', async ({ page }) => {
    await page.goto(`${QD}?id=zzzzz`);
    await page.waitForFunction(() => typeof window.backend !== 'undefined');
    // no-signal should remain visible (no match data will arrive for this ID)
    await expect(page.locator('#no-signal')).not.toHaveClass(/hidden/);
  });

  test('scoreboard appears once a match with the given ID exists', async ({ browser }) => {
    const ctx = await browser.newContext();
    const qs  = await ctx.newPage();
    const qd  = await ctx.newPage();

    await qs.goto(QS);
    await waitForQuickReady(qs);
    const matchId = await getQuickMatchId(qs);

    await qd.goto(`${QD}?id=${matchId}`);
    await qd.waitForSelector('#no-signal.hidden', { timeout: 20000 });
    await expect(qd.locator('#view-score')).toBeVisible();

    await ctx.close();
  });
});

