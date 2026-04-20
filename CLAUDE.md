# Volleyball Scoreboard — Claude Code Context

Real-time volleyball scoreboard with two UIs: a mobile scorekeeper and a TV display.
The same HTML files work locally (Socket.io) and in production (Firebase Realtime DB
or Cloudflare Workers) via an auto-detecting backend adapter.

---

## Repo structure

```
volleyball-scoreboard/
├── server.ts                  # Node.js + Socket.io local server (compiled → server.js)
├── package.json
├── tsconfig.json              # TypeScript config for browser files (public/js/)
├── tsconfig.server.json       # TypeScript config for server.ts
├── tsconfig.tests.json        # TypeScript config for tests/ (type-check only)
├── playwright.config.ts       # Playwright test configuration
├── wrangler.toml              # Cloudflare Workers + Durable Objects config
├── firebase.json              # Firebase Hosting config (serves public/ as web root)
├── .firebaserc                # Firebase project ID
├── .gitignore
├── CLAUDE.md
├── README.md
├── worker/
│   └── index.js               # Cloudflare Worker — WebSocket + Durable Objects
├── .github/
│   └── workflows/
│       ├── deploy.yml         # CI: Playwright tests → deploy to Cloudflare on main
│       └── security.yml       # CI: npm audit, CodeQL SAST, Gitleaks secret scan
├── tests/
│   ├── helpers.ts                        # Shared test helpers and fixtures
│   ├── global.d.ts                       # Window.backend type declaration for page.evaluate()
│   ├── scorekeeper.spec.ts               # Match list, initial state, name editing, swap
│   ├── scoring.spec.ts                   # Scoring, serve toggle, set and match rules
│   ├── display-sync.spec.ts              # Real-time sync scorekeeper → display
│   ├── display-keyboard.spec.ts          # Keyboard navigation for display + quickdisplay
│   ├── scorekeeper-accessibility.spec.ts # ARIA attributes and accessible interactions
│   ├── quick.spec.ts                     # quickscores and quickdisplay UI tests
│   └── quick-sync.spec.ts                # Real-time sync quickscores → quickdisplay
└── public/                    # All files served to browsers
    ├── scorekeeper.html        # Mobile scoring UI
    ├── display.html            # TV scoreboard display
    ├── quickscores.html        # Quick (codeless) scorekeeper UI
    ├── quickdisplay.html       # Quick display, loaded via ?id=<code>
    └── js/
        ├── backend.ts          # Backend adapter source (compiled → backend.js)
        ├── app-config.ts       # Deployment config source (compiled → app-config.js)
        └── firebase-config.ts  # Firebase credentials (user must fill in)
```

Compiled `.js` files (`server.js`, `public/js/*.js`) are gitignored — always edit the `.ts` sources.

---

## Architecture: the backend adapter

`public/js/backend.ts` is the core abstraction. It auto-detects which backend to use
based on `window.location.hostname`:

- **localhost / 127.0.0.1 / 192.168.x.x / 10.x.x.x** → loads Socket.io client,
  connects to `server.ts`
- **anything else** → dynamically loads Firebase compat SDKs from CDN, connects to
  Firebase Realtime Database

Both backends expose the same `window.backend` API:

```js
backend.onMatches(fn)            // subscribe; fn(matches) called on every change
                                  // matches = { [id]: matchState }
backend.createMatch(matchData)   // add a new match (matchData must have .id)
backend.updateMatch(id, patch)   // slash-notation patch to one match
backend.replaceMatch(id, state)  // replace entire match state
backend.deleteMatch(id)          // remove a match
backend.onConnect(fn)            // called when connection established
backend.onDisconnect(fn)         // called when connection lost
```

The HTML files listen for the `backend:ready` DOM event before calling any backend
methods. This ensures the async SDK loading has completed.

```js
window.addEventListener('backend:ready', () => {
  backend.onMatches(matches => { /* render */ });
});
```

### Patch format

`backend.updateMatch()` accepts a flat object with optional slash-delimited keys for
nested fields — identical to Firebase's `update()` semantics:

```js
backend.updateMatch(matchId, {
  'teamA/score': 14,
  serving: 'A',
  matchOver: false
});
```

`server.ts` implements the same slash-notation in its `applyPatch()` function so
Socket.io behaviour is identical.

---

## Match state schema

```ts
{
  id:           string,          // unique match identifier
  code:         string,          // 5-char lowercase alpha code (for quickdisplay lookup)
  venue:        string,
  scheduledAt:  string,          // ISO date string
  started:      boolean,
  matchOver:    boolean,
  currentSet:   number,          // 1-indexed
  setHistory:   [                // one entry per completed set
    { a: number, b: number }
  ],
  serving:      'A' | 'B',
  sidesSwapped: boolean,         // scorekeeper only — reverses left/right layout
  notes:        string,
  teamA: {
    name:  string,               // e.g. "SPIKES FC" (stored uppercased)
    score: number,               // current set score
    sets:  number                // sets won this match
  },
  teamB: {
    name:  string,
    score: number,
    sets:  number
  },
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
npm run build  # compile TypeScript once (required before first run)
npm start      # build + start server
               # or: npm run dev  (build once, then --watch for auto-reload on server changes)
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

When editing TypeScript source files during development, recompile before testing:
- `npx tsc -p tsconfig.server.json` — after editing `server.ts`
- `npx tsc -p tsconfig.json` — after editing `public/js/*.ts`

---

## Deploying to Firebase

### One-time setup

1. Create a project at https://console.firebase.google.com
2. Enable **Realtime Database** (start in test mode)
3. Register a Web app in Project Settings → Your apps → `</>` icon
4. Copy the `firebaseConfig` object and paste into `public/js/firebase-config.ts`
5. Update `.firebaserc` with your `projectId`

### Deploy

```bash
npx firebase login    # first time only
npm run deploy        # runs: npm run build && firebase deploy
```

Files in `public/` are deployed to Firebase Hosting. `server.ts` (and its compiled
`server.js`) is not deployed — it is local only. The HTML files auto-detect the
non-local hostname and switch to the Firebase backend automatically.

---

## Deploying to Cloudflare Workers

The scoreboard can alternatively run as a **Cloudflare Worker** with a Durable Object
for WebSocket state. See `Cloudflare-Deployment.md` for the full setup guide.

```bash
npx wrangler login    # first time only
npm run deploy:cloudflare   # runs: npm run build && wrangler deploy
```

`wrangler.toml` in the repo root configures the Worker name, Durable Object binding,
and `public/` as the Workers Assets directory. Set `backend: 'cloudflare'` in
`public/js/app-config.ts` before deploying so clients use the WebSocket backend
instead of auto-detecting Firebase.

---

## Key design decisions

**Why auto-detect rather than a build flag?**
Zero configuration — the same files work in both environments. Open
`scorekeeper.html` from `localhost:3000` locally, or from `yourapp.web.app` in
production. No env vars, no separate dist files.

**Why flat patch format?**
Firebase's `update()` accepts slash-notation keys for atomic partial updates to
nested objects. Using the same format in Socket.io's `applyPatch()` means the
scorekeeper logic is completely backend-agnostic — it builds one patch object and
calls `backend.updateMatch()`.

**Why TypeScript but no bundler?**
TypeScript is compiled to plain JS files that sit alongside the HTML — no module
system, no imports, no bundler required. The compiled `.js` files are served
directly as static assets, keeping the project portable and simple. Adding Vite is
straightforward if needed.

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
2. Use `backend.updateMatch(id, { 'newField': value })` to write it
3. Read it in `render()` in whichever file needs it
4. No server changes required — the patch/replace system handles everything

### Add a new scorekeeper action (e.g. timeouts)
1. Add a button to `scorekeeper.html`
2. Call `backend.updateMatch(matchId, { 'teamA/timeouts': n })` in the handler
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
`npm test` compiles TypeScript then starts the server automatically on port 3000.
Tests are split across seven spec files in `tests/`; shared helpers live in
`tests/helpers.ts`. They cover scoring logic, volleyball rules, real-time sync
between scorekeeper and display, keyboard navigation, and accessibility attributes.
Use `npx playwright test --headed` to watch tests run in a browser.

**Note for name-editing tests:** Playwright's `page.click()` includes real mouse events that trigger Chromium's focus management (mousedown→focus→blur race when the clicked element is replaced in the DOM). Name-editing tests use `page.locator('#name-a').dispatchEvent('click')` instead, which fires only the JavaScript click event without focus side-effects.

### Test Firebase backend locally
Temporarily change `isLocal()` in `backend.ts` to `return false`. Remember to revert.
