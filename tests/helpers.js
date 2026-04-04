/**
 * tests/helpers.js
 * Shared helpers and constants for all Playwright spec files.
 */

const { expect } = require('@playwright/test');

const SK = '/scorekeeper.html';
const DI = '/display.html';

/** Build a complete fresh match state object for a given id. */
function freshMatchState(id, overrides = {}) {
  const base = {
    id,
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
async function waitForSKReady(page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#conn-dot.live', { timeout: 8000 });
}

/**
 * Wait for the display page to receive its first matches update from the backend.
 * The no-signal overlay disappears as soon as any data arrives.
 */
async function waitForDisplayReady(page) {
  await page.waitForFunction(() => typeof window.backend !== 'undefined');
  await page.waitForSelector('#no-signal.hidden', { timeout: 8000 });
}

/**
 * Create a test match via the backend, navigate the scorekeeper to its scorer
 * view, and return the match id.
 */
async function createAndOpenMatch(page) {
  await page.waitForFunction(
    () => typeof window.backend !== 'undefined' && typeof window.backend.createMatch === 'function'
  );

  const matchId = await page.evaluate(() => {
    const id = 'test_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    window.backend.createMatch({
      id,
      venue:        'Test Court',
      scheduledAt:  new Date().toISOString(),
      started:      false,
      matchOver:    false,
      currentSet:   1,
      setHistory:   [],
      serving:      'A',
      sidesSwapped: false,
      teamA: { name: 'TEAM A', score: 0, sets: 0 },
      teamB: { name: 'TEAM B', score: 0, sets: 0 },
    });
    return id;
  });

  // Wait for THIS match's card specifically (other cards from prior tests may exist)
  await page.waitForSelector(`[data-match-id="${matchId}"]`);
  await page.click(`[data-match-id="${matchId}"]`);

  // Detail panel — click Start Match.
  // Concurrent state updates from other tests can cause continuous list re-renders;
  // if the click doesn't register (card replaced mid-click), retry once.
  try {
    await page.waitForSelector('#detail-panel.show', { timeout: 3000 });
  } catch {
    await page.click(`[data-match-id="${matchId}"]`);
    await page.waitForSelector('#detail-panel.show', { timeout: 8000 });
  }
  await page.click('.btn-start');

  // Confirm scorer view is active
  await page.waitForSelector('#view-scorer.active');

  return matchId;
}

/**
 * Reset the active match to a clean state (optionally with overrides) without
 * leaving the scorer view.
 */
async function resetMatchState(page, matchId, overrides = {}) {
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
    ([id, s]) => window.backend.replaceMatch(id, s),
    [matchId, state]
  );

  await expect(page.locator('#score-a')).toHaveText(String(state.teamA.score));
  await expect(page.locator('#score-b')).toHaveText(String(state.teamB.score));
  await expect(page.locator('#set-num')).toHaveText(String(state.currentSet));
}

/**
 * On the display page, use the ID lookup field to jump to a specific match.
 */
async function openMatchOnDisplay(page, matchId) {
  await page.fill('#id-input', matchId);
  await page.click('.btn-go');
  await expect(page.locator('#view-score')).toHaveClass(/active/, { timeout: 5000 });
}

module.exports = {
  SK,
  DI,
  freshMatchState,
  waitForSKReady,
  waitForDisplayReady,
  createAndOpenMatch,
  resetMatchState,
  openMatchOnDisplay,
};
