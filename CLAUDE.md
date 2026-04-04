# Volleyball Scoreboard — Claude Code Context

Real-time volleyball scoreboard with two UIs: a mobile scorekeeper and a TV display.
The same HTML files work locally (Socket.io) and in production (Firebase Realtime DB)
via an auto-detecting backend adapter.

---

## Repo structure

```
volleyball-scoreboard/
├── server.js                  # Node.js + Socket.io local server
├── package.json
├── playwright.config.js       # Playwright test configuration
├── firebase.json              # Firebase Hosting config (serves public/ as web root)
├── .firebaserc                # Firebase project ID
├── .gitignore
├── CLAUDE.md
├── README.md
├── tests/
│   ├── helpers.js                       # Shared test helpers and fixtures
│   ├── scorekeeper.spec.js              # Match list, initial state, name editing, swap
│   ├── scoring.spec.js                  # Scoring, serve toggle, set and match rules
│   ├── display-sync.spec.js             # Real-time sync scorekeeper → display
│   └── scorekeeper-accessibility.spec.js # ARIA attributes and accessible interactions
└── public/                    # All files served to browsers
    ├── scorekeeper.html        # Mobile scoring UI
    ├── display.html            # TV scoreboard display
    └── js/
        ├── backend.js          # Backend adapter (auto-selects Socket.io or Firebase)
        └── firebase-config.js  # Firebase credentials (user must fill in)
```

---

## Architecture: the backend adapter

`public/js/backend.js` is the core abstraction. It auto-detects which backend to use
based on `window.location.hostname`:

- **localhost / 127.0.0.1 / 192.168.x.x / 10.x.x.x** → loads Socket.io client,
  connects to `server.js`
- **anything else** → dynamically loads Firebase compat SDKs from CDN, connects to
  Firebase Realtime Database

Both backends expose the same `window.backend` API:

```js
backend.onState(fn)        // subscribe to full state updates (called on every change)
backend.update(patch)      // shallow-merge patch into match state
backend.replace(state)     // replace entire match state
backend.onConnect(fn)      // called when connection established
backend.onDisconnect(fn)   // called when connection lost
```

The HTML files listen for the `backend:ready` DOM event before calling any backend
methods. This ensures the async SDK loading has completed.

```js
window.addEventListener('backend:ready', () => {
  backend.onState(data => { /* render */ });
});
```

### Patch format

`backend.update()` accepts a flat object with optional slash-delimited keys for
nested fields — identical to Firebase's `update()` semantics:

```js
backend.update({
  'teamA/score': 14,
  serving: 'A',
  matchOver: false
});
```

`server.js` implements the same slash-notation in its `applyPatch()` function so
Socket.io behaviour is identical.

---

## Match state schema

```js
{
  teamA: {
    name:  string,   // e.g. "SPIKES FC" (stored uppercased)
    score: number,   // current set score
    sets:  number    // sets won this match
  },
  teamB: {
    name:  string,
    score: number,
    sets:  number
  },
  serving:      'A' | 'B',
  currentSet:   number,          // 1-indexed
  setHistory:   [                // one entry per completed set
    { a: number, b: number }
  ],
  matchOver:    boolean,
  sidesSwapped: boolean          // scorekeeper only — reverses left/right layout
}
```

---

## Volleyball rules implemented

- Sets 1–4: first to **25 points**, win by **2**
- Set 5 (deciding): first to **15 points**, win by **2**
- Match: best of 5 — first team to win **3 sets** wins the match
- Awarding a point automatically gives that team the **serve**
- The serve indicator can be overridden manually with the ⇄ button

The constant `SETS_TO_WIN = 3` appears in both HTML files and must be kept in sync.
The set-5 target is derived from `state.currentSet >= 5` inline in `addPoint()`.

---

## Accessibility

`scorekeeper.html` is built to WCAG AA standards:
- Team name `<div>`s are `<button>` elements (keyboard-focusable)
- All interactive elements have `aria-label` updated dynamically from state (team names are uppercased in state, so labels match)
- Serving state is conveyed via a `.sr-only` `<span>` — not colour alone
- The overlay is `role="dialog"` with focus management
- The toast uses `aria-live="polite"`
- The connection dot uses `role="img"` with a live `aria-label`
- `user-scalable=no` is not used — pinch-zoom is allowed
- `--muted` colour meets 4.5:1 contrast on the dark background

---

## Running locally (Socket.io)

```bash
npm install
npm start          # or: npm run dev  (uses --watch for auto-reload)
```

Server starts on port 3000 (override with `PORT=8080 node server.js`).
On startup it prints all LAN IP addresses, e.g.:

```
🏐  Volleyball Scoreboard

   Local:    http://localhost:3000
   Network:  http://192.168.1.42:3000

   Scorekeeper → /scorekeeper.html
   TV display  → /display.html
```

- **Scorekeeper**: open `http://<ip>:3000/scorekeeper.html` on phone
- **TV display**: open `http://<ip>:3000/display.html` in Chrome on Android TV

Both devices must be on the **same Wi-Fi network** as the laptop running the server.

---

## Deploying to Firebase

### One-time setup

1. Create a project at https://console.firebase.google.com
2. Enable **Realtime Database** (start in test mode)
3. Register a Web app in Project Settings → Your apps → `</>` icon
4. Copy the `firebaseConfig` object and paste into `public/js/firebase-config.js`
5. Update `.firebaserc` with your `projectId`

### Deploy

```bash
npx firebase login    # first time only
npm run deploy        # runs: firebase deploy
```

Files in `public/` are deployed to Firebase Hosting. `server.js` is not deployed —
it is local only. The HTML files auto-detect the non-local hostname and switch to
the Firebase backend automatically.

---

## Key design decisions

**Why auto-detect rather than a build flag?**
Zero configuration — the same files work in both environments. Open
`scorekeeper.html` from `localhost:3000` locally, or from `yourapp.web.app` in
production. No env vars, no build step, no separate dist files.

**Why flat patch format?**
Firebase's `update()` accepts slash-notation keys for atomic partial updates to
nested objects. Using the same format in Socket.io's `applyPatch()` means the
scorekeeper logic is completely backend-agnostic — it builds one patch object and
calls `backend.update()`.

**Why no bundler / build toolchain?**
Keeps the project simple and portable. Files can be served directly from any static
host or `file://` for debugging. Adding Vite is straightforward if needed.

**Why two separate HTML files instead of a SPA with routing?**
The scorekeeper and display have very different interaction models and screen
orientations. A single-page app adds complexity for no benefit here.

---

## Common tasks

### Change scoring rules
- `SETS_TO_WIN` constant in both `scorekeeper.html` and `display.html` (keep in sync)
- Set target (25/15) is inline in `addPoint()` in `scorekeeper.html`
- `currentSet >= 5` determines whether it's the deciding set

### Change team colours
CSS variables `--a` (Team A) and `--b` (Team B) are defined in `:root` in both HTML
files. They drive all colour-coded elements consistently.

### Add a new field to match state
1. Add it to `freshState()` in `scorekeeper.html`
2. Use `backend.update({ 'newField': value })` to write it
3. Read it in `render()` in whichever file needs it
4. No server changes required — the patch/replace system handles everything

### Add a new scorekeeper action (e.g. timeouts)
1. Add a button to `scorekeeper.html`
2. Call `backend.update({ 'teamA/timeouts': n })` in the handler
3. Read `s.teamA.timeouts` in `display.html`'s `render()` function

### Add a second TV display
Just open `display.html` on the second device — it subscribes independently from the
same state. No changes needed. Both displays update simultaneously.

### Swap team sides
The **⇄ Swap** button in the scorekeeper footer writes `sidesSwapped: true/false` to state. Both the scorekeeper and the display react by reversing the visual left/right order of the panels. The display also has a local **⇄ Flip** button that XORs with `sidesSwapped` for independent control.

### Run the Playwright test suite
```bash
npm test
```
Playwright starts the server automatically on port 3000. Tests are split across four files in `tests/`; shared helpers live in `tests/helpers.js`. They cover scoring logic, volleyball rules, real-time sync between scorekeeper and display, and accessibility attributes. Use `npx playwright test --headed` to watch tests run in a browser.

**Note for name-editing tests:** Playwright's `page.click()` includes real mouse events that trigger Chromium's focus management (mousedown→focus→blur race when the clicked element is replaced in the DOM). Name-editing tests use `page.locator('#name-a').dispatchEvent('click')` instead, which fires only the JavaScript click event without focus side-effects.

### Test Firebase backend locally
Temporarily change `isLocal()` in `backend.js` to `return false`. Remember to revert.
