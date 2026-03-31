/**
 * server.js — local Socket.io server for volleyball scoreboard
 *
 * Stores all matches in memory as a flat map keyed by match ID.
 *
 * Usage:
 *   node server.js
 *   PORT=8080 node server.js
 *   npm run dev        (auto-reload with --watch)
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const os         = require('os');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
const PORT   = process.env.PORT || 3000;

// Serve everything in /public
app.use(express.static(path.join(__dirname, 'public')));

// 404 handler — static middleware didn't match anything
app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// 500 handler — catches synchronous throws from any middleware above
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.stack ?? err.message ?? err);
  res.status(500).send('Internal server error');
});

// In-memory matches store: { [id]: matchState }
const matches = {};

/**
 * Apply a flat slash-notation patch to a match object.
 * e.g. { 'teamA/score': 5 } sets matches[id].teamA.score = 5
 */
function applyPatch(match, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('/');
    if (parts.length === 1) {
      match[key] = value;
    } else if (parts.length === 2) {
      if (!match[parts[0]]) match[parts[0]] = {};
      match[parts[0]][parts[1]] = value;
    }
  }
}

function broadcast() {
  io.emit('matches', matches);
}

io.on('connection', socket => {
  console.log(`[+] Client connected    (${socket.id})  total: ${io.engine.clientsCount}`);

  // Send full current state immediately on connect
  socket.emit('matches', matches);

  // Create a new match
  socket.on('createMatch', matchData => {
    if (!matchData || !matchData.id) return;
    matches[matchData.id] = matchData;
    broadcast();
  });

  // Partial update to one match
  socket.on('updateMatch', ({ id, patch }) => {
    if (!id || !matches[id]) return;
    applyPatch(matches[id], patch);
    broadcast();
  });

  // Full replacement of one match
  socket.on('replaceMatch', ({ id, state }) => {
    if (!id) return;
    matches[id] = state;
    broadcast();
  });

  // Delete a match
  socket.on('deleteMatch', ({ id }) => {
    if (!id) return;
    delete matches[id];
    broadcast();
  });

  socket.on('disconnect', () => {
    console.log(`[-] Client disconnected (${socket.id})  total: ${io.engine.clientsCount}`);
  });
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log('\n🏐  Volleyball Scoreboard\n');
  console.log(`   Local:    http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   Network:  http://${ip}:${PORT}`));
  console.log('\n   Scorekeeper → /scorekeeper.html');
  console.log('   TV display  → /display.html\n');
});
