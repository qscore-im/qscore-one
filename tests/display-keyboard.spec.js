// tests/display-keyboard.spec.js
// Keyboard-only navigation tests for display.html and quickdisplay.html.
// Targeted at the android-tv project (remote control / no touch), but also
// run on desktop browsers to keep keyboard accessibility verified everywhere.

const { test, expect } = require('@playwright/test');
const {
  DI, QD, QS,
  waitForDisplayReady,
  waitForQuickReady,
  getQuickMatchId,
} = require('./helpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Inject a match via backend and wait for its card to appear. */
async function injectAndWait(page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  const matchId = await page.evaluate(() => {
    const id = 'kbd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    window.backend.createMatch({
      id,
      code:         'kbdcd',
      venue:        'Keyboard Court',
      scheduledAt:  new Date().toISOString(),
      started:      true,
      matchOver:    false,
      currentSet:   1,
      setHistory:   [],
      serving:      'A',
      sidesSwapped: false,
      notes:        '',
      teamA: { name: 'KBD TEAM A', score: 3, sets: 0 },
      teamB: { name: 'KBD TEAM B', score: 1, sets: 0 },
    });
    return id;
  });
  await page.waitForSelector(`[data-match-id="${matchId}"]`);
  return matchId;
}

// ── display.html: list-view keyboard navigation ───────────────────────────────

test.describe('display — list keyboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DI);
    await waitForDisplayReady(page);
  });

  test('filter-text input is reachable by keyboard', async ({ page }) => {
    // Focus the text filter directly — verifies it is in the tab order
    await page.locator('#filter-text').focus();
    await expect(page.locator('#filter-text')).toBeFocused();
  });

  test('typing in filter-text filters match cards', async ({ page }) => {
    const matchId = await injectAndWait(page);
    await page.locator('#filter-text').focus();
    await page.keyboard.type('KBD TEAM A');
    await expect(page.locator(`[data-match-id="${matchId}"]`)).toBeVisible();
  });

  test('Tab from filter-text eventually reaches the ID input', async ({ page }) => {
    // Tab once from the text filter — the ID input is the next text-type focusable
    await page.locator('#filter-text').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#id-input')).toBeFocused();
  });

  test('Tab from the ID input reaches the Go button', async ({ page, browserName }) => {
    // WebKit (Safari) does not Tab to buttons by default on macOS — Chrome/Android TV only
    test.skip(browserName === 'webkit', 'Safari requires full keyboard access to Tab to buttons');
    await page.locator('#id-input').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.btn-go')).toBeFocused();
  });

  test('Tab from the Go button reaches a match card', async ({ page }) => {
    await injectAndWait(page);
    await page.locator('.btn-go').focus();
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('role', 'button');
    await expect(focused).toHaveAttribute('data-match-id');
  });

  test('Enter on a match card opens the scoreboard', async ({ page }) => {
    const matchId = await injectAndWait(page);
    await page.locator(`[data-match-id="${matchId}"]`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-score')).toHaveClass(/active/);
  });

  test('Space on a match card opens the scoreboard', async ({ page }) => {
    const matchId = await injectAndWait(page);
    await page.locator(`[data-match-id="${matchId}"]`).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#view-score')).toHaveClass(/active/);
  });

  test('Enter on the Go button jumps to a match by ID', async ({ page }) => {
    const matchId = await injectAndWait(page);
    await page.fill('#id-input', matchId);
    await page.locator('.btn-go').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-score')).toHaveClass(/active/);
  });
});

// ── display.html: scoreboard keyboard navigation ──────────────────────────────

test.describe('display — scoreboard keyboard navigation', () => {
  test('Flip button is focusable and Enter toggles the swap', async ({ page }) => {
    await page.goto(DI);
    await waitForDisplayReady(page);
    const matchId = await injectAndWait(page);

    await page.fill('#id-input', matchId);
    await page.locator('.btn-go').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-score')).toHaveClass(/active/);

    // Focus the Flip button directly and activate it with Enter
    await page.locator('#btn-flip').focus();
    await expect(page.locator('#btn-flip')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#btn-flip')).toHaveClass(/active/);

    await page.keyboard.press('Enter');
    await expect(page.locator('#btn-flip')).not.toHaveClass(/active/);
  });

  test('Space also toggles the Flip button', async ({ page }) => {
    await page.goto(DI);
    await waitForDisplayReady(page);
    const matchId = await injectAndWait(page);

    await page.fill('#id-input', matchId);
    await page.locator('.btn-go').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-score')).toHaveClass(/active/);

    await page.locator('#btn-flip').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#btn-flip')).toHaveClass(/active/);
  });
});

// ── quickdisplay.html: entry screen keyboard navigation ───────────────────────

test.describe('quickdisplay — entry screen keyboard navigation', () => {
  test('code input is focused on load', async ({ page }) => {
    await page.goto(QD);
    await expect(page.locator('#code-input')).toBeFocused({ timeout: 5000 });
  });

  test('Enter in code input navigates to the match URL', async ({ page }) => {
    await page.goto(QD);
    await page.locator('#code-input').fill('abcde');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]id=abcde/);
  });

  test('Tab from code input reaches the Watch button', async ({ page, browserName }) => {
    // WebKit (Safari) does not Tab to buttons by default on macOS — Chrome/Android TV only
    test.skip(browserName === 'webkit', 'Safari requires full keyboard access to Tab to buttons');
    await page.goto(QD);
    // Tab from code-input — Watch button is the next focusable element
    await page.locator('#code-input').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.btn-watch')).toBeFocused();
  });

  test('Enter on the Watch button navigates', async ({ page }) => {
    await page.goto(QD);
    await page.locator('#code-input').fill('xyzab');
    await page.locator('.btn-watch').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]id=xyzab/);
  });
});

// ── quickdisplay.html: scoreboard keyboard navigation ────────────────────────

test.describe('quickdisplay — scoreboard keyboard navigation', () => {
  test('Flip button is focusable and Enter toggles the swap', async ({ browser }) => {
    const ctx = await browser.newContext();
    const qs  = await ctx.newPage();
    const qd  = await ctx.newPage();

    await qs.goto(QS);
    await waitForQuickReady(qs);
    const matchId = await getQuickMatchId(qs);

    await qd.goto(`${QD}?id=${matchId}`);
    await qd.waitForSelector('#no-signal.hidden', { timeout: 20000 });

    // Focus the Flip button directly and activate with Enter
    await qd.locator('#btn-flip').focus();
    await expect(qd.locator('#btn-flip')).toBeFocused();

    await qd.keyboard.press('Enter');
    await expect(qd.locator('#btn-flip')).toHaveClass(/active/);

    await qd.keyboard.press('Enter');
    await expect(qd.locator('#btn-flip')).not.toHaveClass(/active/);

    await ctx.close();
  });

  test('Space also toggles the Flip button', async ({ browser }) => {
    const ctx = await browser.newContext();
    const qs  = await ctx.newPage();
    const qd  = await ctx.newPage();

    await qs.goto(QS);
    await waitForQuickReady(qs);
    const matchId = await getQuickMatchId(qs);

    await qd.goto(`${QD}?id=${matchId}`);
    await qd.waitForSelector('#no-signal.hidden', { timeout: 20000 });

    await qd.locator('#btn-flip').focus();
    await qd.keyboard.press('Space');
    await expect(qd.locator('#btn-flip')).toHaveClass(/active/);

    await ctx.close();
  });
});
