/**
 * backend.js — unified adapter for Socket.io (local) and Firebase (hosted)
 *
 * Auto-detects based on hostname:
 *   localhost / 127.0.0.1 / 192.168.x.x / 10.x.x.x  →  Socket.io
 *   anything else                                      →  Firebase Realtime DB
 *
 * Public API (available on window.backend after the 'backend:ready' event):
 *   backend.onState(fn)        — subscribe to full state updates
 *   backend.update(patch)      — shallow-merge patch into match state
 *   backend.replace(state)     — replace entire match state
 *   backend.onConnect(fn)      — called when connection is established
 *   backend.onDisconnect(fn)   — called when connection is lost
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

  const stateListeners      = [];
  const connectListeners    = [];
  const disconnectListeners = [];

  function notifyState(state) { stateListeners.forEach(fn => fn(state)); }
  function notifyConnect()    { connectListeners.forEach(fn => fn()); }
  function notifyDisconnect() { disconnectListeners.forEach(fn => fn()); }

  // ── Socket.io backend ─────────────────────────────────────────
  function initSocketIO() {
    console.log('[backend] Using Socket.io (local)');
    const socket = io();

    socket.on('connect',    notifyConnect);
    socket.on('disconnect', notifyDisconnect);
    socket.on('state', state => notifyState(state));

    window.backend = {
      mode: 'socketio',
      onState(fn)      { stateListeners.push(fn); },
      onConnect(fn)    { connectListeners.push(fn); if (socket.connected) fn(); },
      onDisconnect(fn) { disconnectListeners.push(fn); },
      update(patch)    { socket.emit('update', patch); },
      replace(state)   { socket.emit('replace', state); },
    };

    window.dispatchEvent(new Event('backend:ready'));
  }

  // ── Firebase backend ──────────────────────────────────────────
  function initFirebase() {
    console.log('[backend] Using Firebase Realtime Database');

    if (!window.FIREBASE_CONFIG) {
      console.error('[backend] window.FIREBASE_CONFIG not found. Did you fill in public/js/firebase-config.js?');
      return;
    }

    firebase.initializeApp(window.FIREBASE_CONFIG);
    const db       = firebase.database();
    const matchRef = db.ref('volleyball/match');

    db.ref('.info/connected').on('value', snap => {
      snap.val() ? notifyConnect() : notifyDisconnect();
    });

    matchRef.on('value', snap => {
      const data = snap.val();
      if (data) notifyState(data);
    });

    window.backend = {
      mode: 'firebase',
      onState(fn)      { stateListeners.push(fn); },
      onConnect(fn)    { connectListeners.push(fn); },
      onDisconnect(fn) { disconnectListeners.push(fn); },
      update(patch)    { matchRef.update(patch); },
      replace(state)   { matchRef.set(state); },
    };

    window.dispatchEvent(new Event('backend:ready'));
  }

  // ── Bootstrap ──────────────────────────────────────────────────
  if (isLocal()) {
    loadScript('/socket.io/socket.io.js', initSocketIO);
  } else {
    loadScript(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
      () => loadScript(
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
        initFirebase
      )
    );
  }

})();
