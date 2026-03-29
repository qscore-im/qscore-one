# 🏐 Volleyball Scoreboard

Real-time volleyball scoreboard. A scorekeeper uses their phone; a TV shows the live display.

Works **locally with no internet** (Node.js + Socket.io) and can be **deployed to Firebase** with one command — the same HTML files auto-detect which backend to use.

---

## Quick start (local)

```bash
git clone <repo>
cd volleyball-scoreboard
npm install
npm start
```

Open the printed network URL on both devices (same Wi-Fi required):

| Device | URL |
|--------|-----|
| Scorekeeper's phone | `http://<ip>:3000/scorekeeper.html` |
| TV / display | `http://<ip>:3000/display.html` |

Press F11 on the TV for full-screen.

---

## Development

```bash
npm run dev    # auto-reloads server on file changes (Node --watch)
```

The server prints its local and network URLs on startup. Both HTML files are served as static files from `public/` — edit them and refresh the browser.

---

## Running tests

The test suite uses [Playwright](https://playwright.dev/) and covers scoring logic, real-time sync between scorekeeper and display, and accessibility attributes.

```bash
npm test
```

Playwright starts the server automatically on port 3001 for the duration of the test run. Chromium is used by default.

To run a specific test file or filter by name:

```bash
npx playwright test --grep "set logic"
npx playwright test --grep "Real-time sync"
```

To run with a visible browser (useful for debugging):

```bash
npx playwright test --headed
```

On first use, install the browser if not already present:

```bash
npx playwright install chromium
```

---

## Deploy to Firebase

1. Fill in `public/js/firebase-config.js` with your Firebase project credentials
2. Update `.firebaserc` with your project ID
3. `npm run deploy`

See `CLAUDE.md` for full architecture details and setup instructions.

---

## Volleyball rules

| | |
|---|---|
| Sets 1–4 | First to 25, win by 2 |
| Set 5 | First to 15, win by 2 |
| Match | Best of 5 (first to 3 sets) |

---

## Scorekeeper controls

| Action | How |
|--------|-----|
| Award point | Tap the big **+** (also switches serve to that team) |
| Correct mistake | Tap **−** |
| Flip serve | **⇄ Serve** button (top right) |
| Edit team name | Tap the team name |
| Swap team sides | **⇄ Swap** button (footer) |
| Next set | **Next Set** button |
| Reset match | **Reset Match** button |
