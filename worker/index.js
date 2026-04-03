/**
 * Cloudflare Worker — Volleyball Scoreboard
 *
 * Uses a single Durable Object (ScoreboardRoom) to hold all match state
 * and broadcast updates to all connected WebSocket clients.
 *
 * Deploy:
 *   npx wrangler deploy
 *
 * Clients connect via WebSocket to:
 *   wss://<your-worker>.<your-account>.workers.dev/ws
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // WebSocket endpoint
    if (url.pathname === '/ws') {
      const stub = env.SCOREBOARD.getByName('global');
      return stub.fetch(request);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('Volleyball Scoreboard Worker', { status: 200 });
  }
};

// ── Durable Object ───────────────────────────────────────────────────────────

export class ScoreboardRoom {
  constructor(state, _env) {
    this.state   = state;
    this.matches = {};          // in-memory matches map { [id]: matchState }

    // Restore persisted matches on cold start
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('matches');
      if (stored) this.matches = stored;
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair   = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    // Send current state to newly connected client
    server.send(JSON.stringify({ type: 'matches', data: this.matches }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // Called by the runtime for each incoming WebSocket message
  async webSocketMessage(_ws, message) {
    let msg;
    try { msg = JSON.parse(message); } catch { return; }

    switch (msg.type) {

      case 'createMatch':
        if (!msg.data || !msg.data.id) return;
        this.matches[msg.data.id] = msg.data;
        break;

      case 'updateMatch': {
        if (!msg.id || !this.matches[msg.id]) return;
        applyPatch(this.matches[msg.id], msg.patch || {});
        break;
      }

      case 'replaceMatch':
        if (!msg.id) return;
        this.matches[msg.id] = msg.state;
        break;

      case 'deleteMatch':
        if (!msg.id) return;
        delete this.matches[msg.id];
        break;

      default:
        return;
    }

    // Persist to Durable Object storage
    await this.state.storage.put('matches', this.matches);

    // Broadcast updated matches to all clients
    this.broadcast({ type: 'matches', data: this.matches });
  }

  webSocketClose(_ws) {}

  webSocketError(_ws) {}

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(text); } catch { /* runtime cleans up closed sockets */ }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyPatch(obj, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('/');
    if (parts.length === 1) {
      obj[key] = value;
    } else if (parts.length === 2) {
      if (!obj[parts[0]]) obj[parts[0]] = {};
      obj[parts[0]][parts[1]] = value;
    }
  }
}
