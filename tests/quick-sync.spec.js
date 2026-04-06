// tests/quick-sync.spec.js
// Real-time sync tests for quickscores → quickdisplay.
// These tests open two browser contexts simultaneously and are intentionally
// kept in a separate file so device projects (tablet/TV) can exclude them —
// equivalent sync coverage is already provided by display-sync.spec.js on
// the chromium and webkit desktop projects.

const { test, expect } = require('@playwright/test');
const { QS, QD, waitForQuickReady, getQuickMatchId } = require('./helpers');

test.describe('quickscores → quickdisplay sync', () => {
  test('score updates appear on the display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const qs  = await ctx.newPage();
    const qd  = await ctx.newPage();

    await qs.goto(QS);
    await waitForQuickReady(qs);
    const matchId = await getQuickMatchId(qs);

    await qd.goto(`${QD}?id=${matchId}`);
    await qd.waitForSelector('#no-signal.hidden', { timeout: 20000 });

    await qs.click('#panel-a .btn-plus');
    await qs.click('#panel-a .btn-plus');
    await qs.click('#panel-b .btn-plus');

    await expect(qd.locator('#score-a')).toHaveText('2');
    await expect(qd.locator('#score-b')).toHaveText('1');

    await ctx.close();
  });

  test('team name change appears on the display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const qs  = await ctx.newPage();
    const qd  = await ctx.newPage();

    await qs.goto(QS);
    await waitForQuickReady(qs);
    const matchId = await getQuickMatchId(qs);

    await qd.goto(`${QD}?id=${matchId}`);
    await qd.waitForSelector('#no-signal.hidden', { timeout: 20000 });

    await qs.locator('#name-a').dispatchEvent('click');
    await qs.locator('.name-input').fill('HURRICANES');
    await qs.locator('.name-input').press('Enter');

    await expect(qd.locator('#name-a')).toHaveText('HURRICANES');

    await ctx.close();
  });

  test('serving indicator syncs to the display', async ({ browser }) => {
    const ctx = await browser.newContext();
    const qs  = await ctx.newPage();
    const qd  = await ctx.newPage();

    await qs.goto(QS);
    await waitForQuickReady(qs);
    const matchId = await getQuickMatchId(qs);

    await qd.goto(`${QD}?id=${matchId}`);
    await qd.waitForSelector('#no-signal.hidden', { timeout: 20000 });

    await qs.click('#panel-b .btn-plus');

    await expect(qd.locator('#team-b')).toHaveClass(/serving/);
    await expect(qd.locator('#team-a')).not.toHaveClass(/serving/);

    await ctx.close();
  });

  test('celebration overlay shows on the display when a set is won', async ({ browser }) => {
    const ctx = await browser.newContext();
    const qs  = await ctx.newPage();
    const qd  = await ctx.newPage();

    await qs.goto(QS);
    await waitForQuickReady(qs);
    const matchId = await getQuickMatchId(qs);

    await qd.goto(`${QD}?id=${matchId}`);
    await qd.waitForSelector('#no-signal.hidden', { timeout: 20000 });

    await qs.evaluate(([id]) => window.backend.updateMatch(id, {
      'teamA/score': 24, 'teamB/score': 22,
    }), [matchId]);
    await expect(qs.locator('#score-a')).toHaveText('24');
    await qs.click('#panel-a .btn-plus');

    await expect(qd.locator('#celebration')).toHaveClass(/show/, { timeout: 5000 });

    await ctx.close();
  });
});
