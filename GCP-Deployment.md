# GCP Deployment Guide (Cloud Run)

Deploys the scoreboard to **Google Cloud Run** — a fully managed container
platform that runs `server.js` (Node.js + Socket.io) and serves the static
`public/` files from the same container. Cloud Run supports WebSockets natively
and scales to zero when idle (free tier friendly).

---

## How it works

```
Browser ──Socket.io WebSocket──▶ Cloud Run container
                                       │
                                  server.js (Express + Socket.io)
                                  serves public/ static files
                                  holds match state in memory
```

- `server.js` handles both the Socket.io real-time layer and serves `public/`
  as static files via Express.
- `app-config.js` is set to `backend: 'socketio'` so the browser always uses
  Socket.io regardless of the hostname.
- State is in-memory (process-scoped). Cloud Run must run **one instance** (min
  instances = 1, max instances = 1) to avoid state being split across replicas.

> **State persistence:** In-memory state is lost if the container restarts. For
> a stateless setup with persistence, see the Firebase deployment instead
> (documented in `CLAUDE.md`).

---

## Prerequisites

- Node.js ≥ 18 installed locally
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
  (needed to build the container image)
- A [Google Cloud account](https://cloud.google.com) with billing enabled
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed

---

## Step 1 — Create a GCP project

```bash
# Create a new project (choose your own project ID — must be globally unique)
gcloud projects create volleyball-scoreboard-prod --name="Volleyball Scoreboard"

# Set it as the active project
gcloud config set project volleyball-scoreboard-prod
```

Enable billing for the project in the
[GCP Console](https://console.cloud.google.com/billing) (Cloud Run has a
generous free tier but billing must be enabled).

---

## Step 2 — Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

This takes about 30 seconds.

---

## Step 3 — Authenticate Docker with GCP

```bash
gcloud auth login
gcloud auth configure-docker us-central1-docker.pkg.dev
```

Replace `us-central1` with your preferred region if different.

---

## Step 4 — Create an Artifact Registry repository

```bash
gcloud artifacts repositories create scoreboard \
  --repository-format=docker \
  --location=us-central1 \
  --description="Volleyball scoreboard container images"
```

---

## Step 5 — Configure app-config.ts

Edit `public/js/app-config.ts` to force the Socket.io backend (bypassing
hostname auto-detection):

```ts
window.APP_CONFIG = {
  backend: 'socketio',
  cloudflareWorkerUrl: ''
};
```

Then recompile so the change is picked up by the browser:

```bash
npx tsc -p tsconfig.json
```

This ensures clients served from the Cloud Run domain connect via Socket.io
rather than falling through to the Firebase auto-detection.

---

## Step 6 — Create a Dockerfile

Create `Dockerfile` in the project root:

```dockerfile
FROM node:24-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application files
COPY server.js ./
COPY public/ ./public/

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]
```

---

## Step 7 — Build and push the container image

```bash
# Set your project ID and region
PROJECT_ID="volleyball-scoreboard-prod"
REGION="us-central1"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/scoreboard/app:latest"

# Build the image
docker build -t "$IMAGE" .

# Push to Artifact Registry
docker push "$IMAGE"
```

---

## Step 8 — Deploy to Cloud Run

```bash
gcloud run deploy volleyball-scoreboard \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 1 \
  --port 8080 \
  --session-affinity
```

Key flags explained:
- `--allow-unauthenticated` — makes the service publicly accessible (no login required)
- `--min-instances 1` — keeps one container always warm (no cold starts)
- `--max-instances 1` — **critical**: prevents multiple replicas from splitting Socket.io state
- `--session-affinity` — routes repeat connections from the same client to the same instance (important for Socket.io)

Cloud Run prints the service URL when done:

```
Service [volleyball-scoreboard] revision [volleyball-scoreboard-00001-xyz]
has been deployed and is serving 100% of traffic.
Service URL: https://volleyball-scoreboard-xxxxxxxx-uc.a.run.app
```

---

## Step 9 — Verify the deployment

Open the URLs in a browser:

| URL | Purpose |
|-----|---------|
| `https://<service-url>/scorekeeper.html` | Scorekeeper (phone) |
| `https://<service-url>/display.html` | TV display |

Open the scorekeeper on one device and the display on another. Scoring a point
should update the display in real time.

Open browser DevTools → Console and confirm:

```
[backend] Using Socket.io (local)
```

(The label says "local" because that's what the Socket.io backend always logs —
the connection itself goes to Cloud Run.)

---

## Step 10 — (Optional) Add a custom domain

1. Go to [Cloud Run Console](https://console.cloud.google.com/run) → select
   your service → **Manage Custom Domains**
2. Click **Add Mapping** and enter your domain, e.g. `score.example.com`
3. Follow the DNS verification steps (add a TXT record, then a CNAME/A record)
4. GCP provisions a TLS certificate automatically

No code changes are needed — Socket.io works over the custom domain without
any configuration updates.

---

## Redeploying after changes

Rebuild and push the image, then re-deploy:

```bash
docker build -t "$IMAGE" .
docker push "$IMAGE"

gcloud run deploy volleyball-scoreboard \
  --image "$IMAGE" \
  --region "$REGION"
```

Cloud Run performs a zero-downtime rollout by default.

---

## Viewing logs

```bash
# Tail live logs
gcloud run services logs tail volleyball-scoreboard --region "$REGION"

# Or in the console:
# Cloud Run → volleyball-scoreboard → Logs
```

---

## Cost notes

| Resource | Free tier | Notes |
|----------|-----------|-------|
| Cloud Run requests | 2M requests/month | |
| Cloud Run compute | 180,000 vCPU-seconds/month | `--min-instances 1` means the container runs 24/7; estimate ~$5–10/month beyond free tier |
| Artifact Registry | 0.5 GB storage free | Image is typically ~100 MB |

For a low-traffic scoreboard, `--min-instances 1` at the smallest instance size
(`--cpu 0.08 --memory 128Mi`) keeps costs minimal.

To add explicit resource limits:

```bash
gcloud run services update volleyball-scoreboard \
  --region "$REGION" \
  --cpu 0.08 \
  --memory 128Mi
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Console shows `[backend] Using Firebase` | `app-config.js` still on `'auto'` | Set `backend: 'socketio'` and redeploy |
| Scorekeeper updates don't appear on display | Multiple Cloud Run instances running | Confirm `--max-instances 1`; check Cloud Run metrics for instance count |
| Connection drops / reconnects frequently | Cloud Run idle timeout (default 60s for WebSockets) | Socket.io reconnects automatically; or increase timeout: `--timeout 3600` |
| `docker build` fails | Docker not running | Start Docker Desktop |
| `gcloud run deploy` fails — "billing not enabled" | GCP billing not linked | Add a billing account in the GCP Console |
| 403 on the service URL | `--allow-unauthenticated` not set | Run `gcloud run services add-iam-policy-binding` or redeploy with that flag |
