// tests/scoring.spec.js
// Scoring logic tests: points, serve toggle, set and match rules.

import { test, expect } from '@playwright/test';
import {
  SK,
  waitForSKReady,
  createAndOpenMatch,
  resetMatchState,
} from './helpers';

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

// ── Scorekeeper: scoring ──────────────────────────────────────────────────────

test.describe('Scorekeeper — scoring', () => {
  let matchId: string;

  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    matchId = await createAndOpenMatch(page);
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
    await page.evaluate(([id]) => window.backend.updateMatch(id, { 'teamA/score': 5 }), [matchId]);
    await expect(page.locator('#score-a')).toHaveText('5');
    await page.click('#panel-a .btn-minus');
    await expect(page.locator('#score-a')).toHaveText('4');
  });

  test('removes a point from Team B', async ({ page }) => {
    await page.evaluate(([id]) => window.backend.updateMatch(id, { 'teamB/score': 3 }), [matchId]);
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
    await createAndOpenMatch(page);
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

// ── Scorekeeper: set and match logic ──────────────────────────────────────────

test.describe('Scorekeeper — set logic', () => {
  let matchId: string;

  test.beforeEach(async ({ page }) => {
    await page.goto(SK);
    await waitForSKReady(page);
    matchId = await createAndOpenMatch(page);
  });

  test('no set win at 25 without a 2-point lead', async ({ page }) => {
    await resetMatchState(page, matchId, { teamA: { score: 24 }, teamB: { score: 24 } });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('25');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  });

  test('set won at 25 with a 2-point lead', async ({ page }) => {
    await resetMatchState(page, matchId, { teamA: { score: 24 }, teamB: { score: 22 } });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set won when extending beyond 25 (e.g. 27-25)', async ({ page }) => {
    await resetMatchState(page, matchId, { teamA: { score: 26 }, teamB: { score: 25 } });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set 5 target label shows 15', async ({ page }) => {
    await resetMatchState(page, matchId, {
      currentSet: 5,
      teamA: { score: 0, sets: 2 },
      teamB: { score: 0, sets: 2 },
    });
    await expect(page.locator('#set-num')).toHaveText('5');
    await expect(page.locator('#target-label')).toContainText('15');
  });

  test('set 5 won at 15 with a 2-point lead', async ({ page }) => {
    await resetMatchState(page, matchId, {
      currentSet: 5,
      teamA: { score: 14, sets: 2 },
      teamB: { score: 12, sets: 2 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
  });

  test('set 5 not won at 15-14 (no 2-point lead)', async ({ page }) => {
    await resetMatchState(page, matchId, {
      currentSet: 5,
      teamA: { score: 14, sets: 2 },
      teamB: { score: 14, sets: 2 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#score-a')).toHaveText('15');
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  });

  test('winning 3 sets shows match-won overlay', async ({ page }) => {
    await resetMatchState(page, matchId, {
      currentSet: 3,
      teamA: { score: 24, sets: 2 },
      teamB: { score: 20, sets: 0 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    await expect(page.locator('#ov-label')).toContainText('Match');
  });

  test('set history is recorded after a set win', async ({ page }) => {
    await resetMatchState(page, matchId, {
      teamA: { score: 24, sets: 0 },
      teamB: { score: 20, sets: 0 },
    });
    await page.click('#panel-a .btn-plus');
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    await page.click('#ov-btn');   // "Next Set →"
    await expect(page.locator('#hist-a')).toContainText('25');
    await expect(page.locator('#hist-b')).toContainText('20');
  });

  test('Next Set button resets scores and increments set number', async ({ page }) => {
    await page.evaluate(([id]) => window.backend.updateMatch(id, { 'teamA/score': 7, 'teamB/score': 5 }), [matchId]);
    await expect(page.locator('#score-a')).toHaveText('7');
    await page.click('button:has-text("Next Set")');
    await expect(page.locator('#score-a')).toHaveText('0');
    await expect(page.locator('#score-b')).toHaveText('0');
    await expect(page.locator('#set-num')).toHaveText('2');
  });
});




