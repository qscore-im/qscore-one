/**
 * backend.js — unified adapter for Socket.io (local), Firebase (hosted), and
 *              Cloudflare Workers + Durable Objects (cloudflare).
 *
 * Backend selection (checked in order):
 *   1. window.APP_CONFIG.backend  — explicit override in app-config.js
 *   2. Auto-detect by hostname:
 *        localhost / 127.0.0.1 / 192.168.x.x / 10.x.x.x  →  Socket.io
 *        anything else                                      →  Firebase
 *
 * Public API (available on window.backend after the 'backend:ready' event):
 *
 *   backend.onMatches(fn)            — subscribe; fn(matches) on every change
 *                                      matches = { [id]: matchState }
 *   backend.createMatch(matchData)   — add a new match (matchData must have .id)
 *   backend.updateMatch(id, patch)   — slash-notation patch to one match
 *   backend.replaceMatch(id, state)  — replace entire match state
 *   backend.deleteMatch(id)          — remove a match
 *   backend.onConnect(fn)            — called when connection established
 *   backend.onDisconnect(fn)         — called when connection lost
 */

(function () {
  'use strict';

  const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];
  const LOCAL_RANGES    = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

  function isLocal() {
    const h = location.hostname;
    return LOCAL_HOSTNAMES.includes(h) || LOCAL_RANGES.some(r => r.test(h));
  }

  function loadScript(src, cb) {
    const s  = document.createElement('script');
    s.src    = src;
    s.onload = cb;
    s.onerror = () => console.error('[backend] Failed to load', src);
    document.head.appendChild(s);
  }

  const matchesListeners  = [];
  const connectListeners  = [];
  const disconnectListeners = [];

  function notifyMatches(matches)  { matchesListeners.forEach(fn => fn(matches)); }
  function notifyConnect()         { connectListeners.forEach(fn => fn()); }
  function notifyDisconnect()      { disconnectListeners.forEach(fn => fn()); }

  // ── Socket.io backend ─────────────────────────────────────────────────────
  function initSocketIO() {
    console.log('[backend] Using Socket.io (local)');
    const socket = io();

    socket.on('connect',    notifyConnect);
    socket.on('disconnect', notifyDisconnect);
    socket.on('matches',    data => notifyMatches(data || {}));

    window.backend = {
      mode: 'socketio',
      onMatches(fn)              { matchesListeners.push(fn); },
      onConnect(fn)              { connectListeners.push(fn); if (socket.connected) fn(); },
      onDisconnect(fn)           { disconnectListeners.push(fn); },
      createMatch(matchData)     { socket.emit('createMatch', matchData); },
      updateMatch(id, patch)     { socket.emit('updateMatch', { id, patch }); },
      replaceMatch(id, state)    { socket.emit('replaceMatch', { id, state }); },
      deleteMatch(id)            { socket.emit('deleteMatch', { id }); },
    };

    window.dispatchEvent(new Event('backend:ready'));
  }

  // ── Firebase backend ──────────────────────────────────────────────────────
  function initFirebase() {
    console.log('[backend] Using Firebase Realtime Database');

    if (!window.FIREBASE_CONFIG) {
      console.error('[backend] window.FIREBASE_CONFIG not found. Did you fill in public/js/firebase-config.js?');
      return;
    }

    firebase.initializeApp(window.FIREBASE_CONFIG);
    const db         = firebase.database();
    const matchesRef = db.ref('volleyball/matches');

    db.ref('.info/connected').on('value', snap => {
      snap.val() ? notifyConnect() : notifyDisconnect();
    });

    matchesRef.on('value', snap => {
      notifyMatches(snap.val() || {});
    });

    window.backend = {
      mode: 'firebase',
      onMatches(fn)           { matchesListeners.push(fn); },
      onConnect(fn)           { connectListeners.push(fn); },
      onDisconnect(fn)        { disconnectListeners.push(fn); },
      createMatch(matchData)  { matchesRef.child(matchData.id).set(matchData); },
      updateMatch(id, patch)  { matchesRef.child(id).update(patch); },
      replaceMatch(id, state) { matchesRef.child(id).set(state); },
      deleteMatch(id)         { matchesRef.child(id).remove(); },
    };

    window.dispatchEvent(new Event('backend:ready'));
  }

  // ── Cloudflare Workers + Durable Objects backend ──────────────────────────
  function initCloudflare(workerUrl) {
    console.log('[backend] Using Cloudflare Workers WebSocket');

    let ws;
    let reconnectTimer;
    let queue = [];

    function connect() {
      ws = new WebSocket(workerUrl);

      ws.onopen = () => {
        clearTimeout(reconnectTimer);
        queue.forEach(msg => ws.send(JSON.stringify(msg)));
        queue = [];
        notifyConnect();
      };

      ws.onclose = () => {
        notifyDisconnect();
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = err => {
        console.error('[backend] WebSocket error', err);
      };

      ws.onmessage = evt => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'matches') notifyMatches(msg.data || {});
        } catch (e) {
          console.error('[backend] Bad message', e);
        }
      };
    }

    function send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        queue.push(msg);
      }
    }

    connect();

    window.backend = {
      mode: 'cloudflare',
      onMatches(fn)           { matchesListeners.push(fn); },
      onConnect(fn)           { connectListeners.push(fn); },
      onDisconnect(fn)        { disconnectListeners.push(fn); },
      createMatch(matchData)  { send({ type: 'createMatch', data: matchData }); },
      updateMatch(id, patch)  { send({ type: 'updateMatch', id, patch }); },
      replaceMatch(id, state) { send({ type: 'replaceMatch', id, state }); },
      deleteMatch(id)         { send({ type: 'deleteMatch', id }); },
    };

    setTimeout(() => window.dispatchEvent(new Event('backend:ready')), 0);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  const cfg = window.APP_CONFIG || {};

  // Local hostnames always use Socket.io regardless of app-config —
  // this ensures `npm run dev` and `npm test` work even when app-config.js
  // is configured for Cloudflare or Firebase.
  if (isLocal()) {
    loadScript('/socket.io/socket.io.js', initSocketIO);
  } else if (cfg.backend === 'cloudflare' && cfg.cloudflareWorkerUrl) {
    initCloudflare(cfg.cloudflareWorkerUrl);
  } else {
    // firebase (explicit) or auto-detect non-local
    loadScript(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
      () => loadScript(
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
        initFirebase
      )
    );
  }

})();
