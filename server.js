/**
 * server.js — local Socket.io server for volleyball scoreboard
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

// In-memory match state
let matchState = freshState();

function freshState() {
  return {
    teamA:      { name: 'TEAM A', score: 0, sets: 0 },
    teamB:      { name: 'TEAM B', score: 0, sets: 0 },
    serving:    'A',
    currentSet: 1,
    setHistory: [],
    matchOver:  false
  };
}

/**
 * Apply a flat patch to matchState.
 * Supports slash-notation for nested keys, e.g. { 'teamA/score': 5 }
 * This mirrors Firebase's update() semantics so scorekeeper logic is backend-agnostic.
 */
function applyPatch(patch) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('/');
    if (parts.length === 1) {
      matchState[key] = value;
    } else if (parts.length === 2) {
      if (!matchState[parts[0]]) matchState[parts[0]] = {};
      matchState[parts[0]][parts[1]] = value;
    }
  }
}

io.on('connection', socket => {
  console.log(`[+] Client connected    (${socket.id})  total: ${io.engine.clientsCount}`);

  // Send full current state immediately on connect
  socket.emit('state', matchState);

  // Partial update (e.g. score change, serve switch)
  socket.on('update', patch => {
    applyPatch(patch);
    io.emit('state', matchState);
  });

  // Full replacement (reset match)
  socket.on('replace', newState => {
    matchState = newState;
    io.emit('state', matchState);
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
