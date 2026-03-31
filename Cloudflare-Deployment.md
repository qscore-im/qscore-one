# Cloudflare Deployment Guide

Deploys the scoreboard as a **Cloudflare Worker** with **Durable Objects** for
real-time WebSocket state, and **Workers Assets** for the static files
(`public/`). No separate hosting service required — one `wrangler deploy`
command ships everything.

---

## How it works

```
Browser ──WebSocket──▶ Worker (/ws) ──▶ ScoreboardRoom (Durable Object)
                                              │
                                       persists to DO storage
                                       broadcasts to all clients
```

- `worker/index.js` handles the WebSocket endpoint and delegates to the
  `ScoreboardRoom` Durable Object.
- Static files in `public/` are served automatically via Workers Assets.
- `app-config.js` tells `backend.js` to use the Cloudflare WebSocket backend
  instead of auto-detecting Firebase.

---

## Prerequisites

- Node.js ≥ 18 installed locally
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is
  sufficient)
- Dependencies installed: `npm install`

---

## Step 1 — Authenticate Wrangler

```bash
npx wrangler login
```

A browser window opens. Log in with your Cloudflare account. Wrangler stores a
token locally — you only need to do this once per machine.

Verify it worked:

```bash
npx wrangler whoami
```

---

## Step 2 — Create the Cloudflare project (first deploy)

> **Note:** `wrangler.toml` is already configured in this repo. You do not need
> to create it.

Review `wrangler.toml` to confirm the project name and Durable Object binding
match your expectations:

```toml
name            = "volleyball-scoreboard"
main            = "worker/index.js"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name       = "SCOREBOARD"
class_name = "ScoreboardRoom"

[[migrations]]
tag            = "v1"
new_classes    = ["ScoreboardRoom"]

[assets]
directory = "./public"
```

If you want a different worker name, change `name` here before deploying.

---

## Step 3 — Configure app-config.js

Before deploying, set the `cloudflareWorkerUrl` in `public/js/app-config.js`.
The URL follows the pattern `wss://<worker-name>.<account-subdomain>.workers.dev/ws`.

Find your account subdomain:

```bash
npx wrangler whoami
# Look for "Account ID" — your subdomain is shown in your Cloudflare dashboard
# under Workers & Pages → your worker → Settings → Domains & Routes
```

You can also do a **dry-run deploy first** (Step 4), note the URL printed in the
output, then come back and update this file.

Edit `public/js/app-config.js`:

```js
window.APP_CONFIG = {
  backend: 'cloudflare',
  cloudflareWorkerUrl: 'wss://volleyball-scoreboard.<your-subdomain>.workers.dev/ws'
};
```

Replace `<your-subdomain>` with your actual Cloudflare workers subdomain.

---

## Step 4 — Deploy

```bash
npm run deploy:cloudflare
# equivalent to: npx wrangler deploy
```

Wrangler will:
1. Bundle `worker/index.js`
2. Upload `public/` as static assets
3. Create the `ScoreboardRoom` Durable Object class (migration `v1`)
4. Print the live URL, e.g.:
   ```
   Deployed volleyball-scoreboard to:
   https://volleyball-scoreboard.<your-subdomain>.workers.dev
   ```

---

## Step 5 — Verify the deployment

Open the URLs in a browser:

| URL | Purpose |
|-----|---------|
| `https://volleyball-scoreboard.<subdomain>.workers.dev/scorekeeper.html` | Scorekeeper (phone) |
| `https://volleyball-scoreboard.<subdomain>.workers.dev/display.html` | TV display |
| `https://volleyball-scoreboard.<subdomain>.workers.dev/health` | Health check (returns `OK`) |

Open the scorekeeper on one device and the display on another. Scoring a point
should update the display in real time via WebSocket.

Open browser DevTools → Console and confirm:

```
[backend] Using Cloudflare Workers WebSocket
```

---

## Step 6 — (Optional) Add a custom domain

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. Select your `volleyball-scoreboard` worker
3. **Settings → Domains & Routes → Add Custom Domain**
4. Enter your domain (must be on Cloudflare DNS), e.g. `score.example.com`
5. Update `cloudflareWorkerUrl` in `app-config.js` to:
   ```js
   cloudflareWorkerUrl: 'wss://score.example.com/ws'
   ```
6. Redeploy: `npm run deploy:cloudflare`

---

## Local development with Wrangler

To test the Worker locally before deploying:

```bash
npm run cf:dev
# equivalent to: npx wrangler dev
```

Wrangler starts a local server (default: `http://localhost:8787`) that emulates
the Workers + Durable Objects runtime. The static files in `public/` are served
automatically.

You still need to set `app-config.js` to use the Cloudflare backend for local
Wrangler dev:

```js
window.APP_CONFIG = {
  backend: 'cloudflare',
  cloudflareWorkerUrl: 'ws://localhost:8787/ws'
};
```

Remember to switch it back to the production `wss://` URL before deploying.

---

## Redeploying after changes

Any time you change `worker/index.js`, `public/`, or `wrangler.toml`:

```bash
npm run deploy:cloudflare
```

Wrangler performs an incremental upload — only changed assets are re-uploaded.

---

## Viewing logs

Stream real-time logs from the production worker:

```bash
npx wrangler tail
```

---

## Durable Object storage

Match state is persisted to Durable Object storage automatically in
`worker/index.js`. On a cold start (first request after the DO is evicted),
state is restored from storage. No external database is needed.

To inspect or wipe stored state, use the Cloudflare dashboard:
**Workers & Pages → Durable Objects → ScoreboardRoom → Storage**

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Console shows `[backend] Using Firebase` | `app-config.js` not updated | Set `backend: 'cloudflare'` and the correct `cloudflareWorkerUrl` |
| WebSocket connect fails | Wrong URL or `ws://` instead of `wss://` in production | Confirm the URL matches the deployed worker domain; production requires `wss://` |
| `wrangler deploy` fails with "Durable Objects not enabled" | Account doesn't have DO (rare on free tier) | Enable in Cloudflare dashboard → Workers & Pages → your worker → Settings |
| Static assets not updating | Browser cache | Hard-refresh (`Ctrl+Shift+R`) or open in incognito |
| `wrangler: command not found` | Not installed | Run `npm install` first; use `npx wrangler` |
