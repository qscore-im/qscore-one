/**
 * tests/helpers.js
 * Shared helpers and constants for all Playwright spec files.
 */

import { expect, Page } from '@playwright/test';

const SK = '/scorekeeper.html';
const DI = '/display.html';
const QS = '/quickscores.html';
const QD = '/quickdisplay.html';

/** Build a complete fresh match state object for a given id. */
function freshMatchState(id: string, overrides: Record<string, any> = {}) {
  const base = {
    id,
    code:         'testcd',
    venue:        'Test Court',
    scheduledAt:  new Date().toISOString(),
    started:      true,
    matchOver:    false,
    currentSet:   1,
    setHistory:   [],
    serving:      'A',
    sidesSwapped: false,
    notes:        '',
    teamA: { name: 'TEAM A', score: 0, sets: 0 },
    teamB: { name: 'TEAM B', score: 0, sets: 0 },
  };
  // Merge nested teamA/teamB overrides correctly
  return {
    ...base,
    ...overrides,
    teamA: { ...base.teamA, ...(overrides.teamA || {}) },
    teamB: { ...base.teamB, ...(overrides.teamB || {}) },
  };
}

/**
 * Wait for the Socket.io backend to be ready on the scorekeeper list view.
 */
async function waitForSKReady(page: Page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#conn-dot.live', { timeout: 20000 });
}

/**
 * Wait for the display page to receive its first matches update from the backend.
 * The no-signal overlay disappears as soon as any data arrives.
 */
async function waitForDisplayReady(page: Page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#no-signal.hidden', { timeout: 20000 });
}

/**
 * Create a test match via the backend, navigate the scorekeeper to its scorer
 * view, and return the match id.
 */
async function createAndOpenMatch(page: Page) {
  await page.waitForFunction(
    () => typeof window.backend !== 'undefined' && typeof window.backend.createMatch === 'function'
  );

  const matchId = await page.evaluate(() => {
    const id = 'test_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    window.backend.createMatch({
      id,
      code:         'testcd',
      venue:        'Test Court',
      scheduledAt:  new Date().toISOString(),
      started:      false,
      matchOver:    false,
      currentSet:   1,
      setHistory:   [],
      serving:      'A',
      sidesSwapped: false,
      notes:        '',
      teamA: { name: 'TEAM A', score: 0, sets: 0 },
      teamB: { name: 'TEAM B', score: 0, sets: 0 },
    });
    return id;
  });

  // Wait for THIS match's card specifically (other cards from prior tests may exist)
  await page.waitForSelector(`[data-match-id="${matchId}"]`);

  // Use dispatchEvent rather than page.click — concurrent socket.io broadcasts from other
  // workers cause continuous list re-renders in WebKit, which keeps the card in a
  // "not stable" state and makes page.click() spin until the test timeout. dispatchEvent
  // fires the JS click handler synchronously without any actionability checks.
  await page.locator(`[data-match-id="${matchId}"]`).dispatchEvent('click');
  await page.waitForSelector('#detail-panel.show', { timeout: 20000 });
  await page.locator('.btn-start').dispatchEvent('click');

  // Confirm scorer view is active
  await page.waitForSelector('#view-scorer.active');

  return matchId;
}

/**
 * Reset the active match to a clean state (optionally with overrides) without
 * leaving the scorer view.
 */
async function resetMatchState(page: Page, matchId: string, overrides: Record<string, any> = {}) {
  // Dismiss any open overlay first
  if (await page.locator('#overlay.show').count() > 0) {
    const btnText = await page.locator('#ov-btn').textContent();
    if (btnText && btnText.includes('Next Set')) {
      await page.click('#ov-btn');
    } else {
      // Match-won overlay — dismiss via JS so we stay in scorer view
      await page.evaluate(() => {
        document.getElementById('overlay').classList.remove('show');
      });
    }
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  }

  const state = freshMatchState(matchId, overrides);
  await page.evaluate(
    ([id, s]: [string, any]) => window.backend.replaceMatch(id, s),
    [matchId, state]
  );

  await expect(page.locator('#score-a')).toHaveText(String(state.teamA.score));
  await expect(page.locator('#score-b')).toHaveText(String(state.teamB.score));
  await expect(page.locator('#set-num')).toHaveText(String(state.currentSet));
}

/**
 * On the display page, use the ID lookup field to jump to a specific match.
 */
async function openMatchOnDisplay(page: Page, matchId: string) {
  await page.fill('#id-input', matchId);
  await page.locator('.btn-go').dispatchEvent('click');
  await expect(page.locator('#view-score')).toHaveClass(/active/, { timeout: 5000 });
}

/**
 * Wait for the quickscores page to be ready: connected and match state received.
 */
async function waitForQuickReady(page: Page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#conn-dot.live', { timeout: 20000 });
  await page.waitForSelector('#waiting.hidden', { timeout: 20000 });
}

/**
 * Read the short match code from the quickscores session-strip.
 */
async function getQuickMatchId(page: Page) {
  return (await page.locator('#display-code').textContent()).trim();
}

export {
  SK,
  DI,
  QS,
  QD,
  freshMatchState,
  waitForSKReady,
  waitForDisplayReady,
  createAndOpenMatch,
  resetMatchState,
  openMatchOnDisplay,
  waitForQuickReady,
  getQuickMatchId,
};
