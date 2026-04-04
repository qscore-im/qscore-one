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

- Node.js ≥ 24 installed locally
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
name            = "qscore-one"
main            = "worker/index.js"
compatibility_date = "2025-01-01"

[[durable_objects.bindings]]
name       = "SCOREBOARD"
class_name = "ScoreboardRoom"

[[migrations]]
tag                = "v1"
new_sqlite_classes = ["ScoreboardRoom"]

[assets]
directory = "./public"
```

If you want a different worker name, change `name` here before deploying.

---

## Step 3 — (Optional) Set up GitHub Actions for automatic deployment

The repo includes `.github/workflows/deploy.yml`, which runs Playwright tests on
every push and PR to `main`, and deploys to Cloudflare automatically when tests
pass on a push to `main`.

Two secrets must be added to the GitHub repository before the workflow can deploy.

### Where to add secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**.

These should be added as **Repository secrets** (not environment secrets), so they
are available to any workflow run on the `main` branch without additional
environment configuration.

| Secret name | Value | Where to get it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with Workers edit permissions | See below |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare dashboard → right sidebar on any Workers & Pages page |

### Creating the API token

1. Go to [Cloudflare dashboard](https://dash.cloudflare.com) → **My Profile** (top-right avatar) → **API Tokens**
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template — it grants exactly the permissions Wrangler needs
4. Under **Account Resources**, select your account
5. Under **Zone Resources**, select **All zones** (or restrict to the zone your custom domain uses, if any)
6. Click **Continue to summary** → **Create Token**
7. Copy the token value — it is shown **only once**. Paste it as the `CLOUDFLARE_API_TOKEN` secret in GitHub.

> **Note on secret scope:** Repository secrets are used here rather than
> environment secrets because this project does not use GitHub Environments.
> If you later configure a GitHub Environment (e.g. `production`) with required
> reviewers or deployment rules, move the secrets there and update the `deploy`
> job in `deploy.yml` to specify `environment: production`.

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
   Deployed qscore-one to:
   https://qscore-one.<your-subdomain>.workers.dev
   ```

---

## Step 5 — Verify the deployment

Open the URLs in a browser:

| URL | Purpose |
|-----|---------|
| `https://qscore-one.<subdomain>.workers.dev/scorekeeper.html` | Scorekeeper (phone) |
| `https://qscore-one.<subdomain>.workers.dev/display.html` | TV display |
| `https://qscore-one.<subdomain>.workers.dev/health` | Health check (returns `OK`) |

Open the scorekeeper on one device and the display on another. Scoring a point
should update the display in real time via WebSocket.

Open browser DevTools → Console and confirm:

```
[backend] Using Cloudflare Workers WebSocket
```

---

## Step 6 — (Optional) Add a custom domain

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. Select your `qscore-one` worker
3. **Settings → Domains & Routes → Add Custom Domain**
4. Enter your domain (must be on Cloudflare DNS), e.g. `score.example.com`

No changes to `app-config.js` are needed — the WebSocket URL is derived from
`window.location` automatically.

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

`app-config.js` automatically uses `ws://localhost:8787/ws` when running locally
and `wss://<your-domain>/ws` in production — no changes needed.

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
