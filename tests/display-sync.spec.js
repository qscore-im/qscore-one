// tests/display-sync.spec.js
// Real-time sync tests: scorekeeper → display propagation.

const { test, expect } = require('@playwright/test');
const {
  SK, DI,
  freshMatchState,
  waitForSKReady, waitForDisplayReady,
  createAndOpenMatch,
  openMatchOnDisplay,
} = require('./helpers');

// ── Real-time sync: scorekeeper → display ─────────────────────────────────────

test.describe('Real-time sync', () => {
  test('score update on scorekeeper appears on display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const sk  = await ctx.newPage();
    const di  = await ctx.newPage();

    await sk.goto(SK);
    await waitForSKReady(sk);
    const matchId = await createAndOpenMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di, matchId);

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
    const matchId = await createAndOpenMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di, matchId);

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
    const matchId = await createAndOpenMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di, matchId);

    await sk.click('[aria-label="Toggle serve"]');

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
    const matchId = await createAndOpenMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di, matchId);

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
    const matchId = await createAndOpenMatch(sk);

    await di.goto(DI);
    await waitForDisplayReady(di);
    await openMatchOnDisplay(di, matchId);

    await sk.evaluate(
      ([id, s]) => window.backend.replaceMatch(id, s),
      [matchId, freshMatchState(matchId, { teamA: { score: 24, sets: 0 }, teamB: { score: 22, sets: 0 } })]
    );
    await expect(sk.locator('#score-a')).toHaveText('24');
    await sk.click('#panel-a .btn-plus');

    await expect(di.locator('#celebration')).toHaveClass(/show/, { timeout: 5000 });

    await ctx.close();
  });

});
