const { Server } = require('socket.io');
const SessionsService = require('../modules/sessions/sessions.service');
const Session = require('../models/session');

/**
 * Initializes Socket.IO and sets up namespaces for real-time QR token rotation.
 * Namespace: /sessions
 * Events:
 *  - professor:join { sessionId } -> Professor joins a room to start broadcasting QR tokens
 *  - student:subscribe { sessionId } -> Student subscribes to receive rotating QR tokens
 *  - qr:tick -> Emitted every second with { sessionId, token, ts }
 */
function initRealtime(server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  const sessionsNs = io.of('/sessions');

  // Maintain active intervals per session
  const broadcasters = new Map(); // sessionId -> intervalId

  async function startBroadcast(sessionId) {
    if (broadcasters.has(sessionId)) return; // already broadcasting
    const sess = await Session.findOne({ sessionId });
    if (!sess) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const nowSec = Math.floor(now / 1000);
      if (new Date(sess.expiresAt).getTime() <= now) {
        clearInterval(interval);
        broadcasters.delete(sessionId);
        sessionsNs.to(sessionId).emit('session:ended', { sessionId });
        return;
      }
      if (!sess.qrSeed) return;
      const token = SessionsService.deriveRotatingToken(sess.qrSeed, sess.sessionId, nowSec);
      sessionsNs.to(sessionId).emit('qr:tick', { sessionId, token, ts: nowSec });
    }, 1000);
    broadcasters.set(sessionId, interval);
  }

  function maybeStopBroadcast(sessionId) {
    const size = sessionsNs.adapter.rooms.get(sessionId)?.size || 0;
    if (size === 0) {
      const t = broadcasters.get(sessionId);
      if (t) {
        clearInterval(t);
        broadcasters.delete(sessionId);
      }
    }
  }

  sessionsNs.on('connection', (socket) => {
    // Minimal identification could be added (auth) if needed
    socket.on('professor:join', async (payload = {}) => {
      const sessionId = payload.sessionId;
      if (!sessionId) return;
      await socket.join(sessionId);
      await startBroadcast(sessionId);
      socket.emit('professor:joined', { sessionId });
    });

    socket.on('student:subscribe', async (payload = {}) => {
      const sessionId = payload.sessionId;
      if (!sessionId) return;
      await socket.join(sessionId);
      socket.emit('student:subscribed', { sessionId });
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) maybeStopBroadcast(room);
      }
    });
  });

  io.engine.on('connection_error', (err) => {
    console.error('Socket.IO connection error:', err.message);
  });

  console.log('Realtime layer initialized');
  return io;
}

module.exports = { initRealtime };
