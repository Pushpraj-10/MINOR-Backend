const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  professorUid: { type: String, required: true },
  title: { type: String },
  // Rotating QR seed used to derive per-second tokens (server-side only)
  qrSeed: { type: String, required: true },
  // Legacy static token (optional, maintained for backward compatibility)
  qrToken: { type: String },
  createdAt: { type: Date, required: true, default: () => new Date() },
  expiresAt: { type: Date, required: true },
  meta: { type: Object, default: null },
});

// Unique indexes are already defined via schema paths (unique: true)
SessionSchema.index({ createdAt: 1 });
// Previously we used a TTL index on `expiresAt` to auto-delete sessions.
// Remove the TTL index so session records are retained indefinitely for audit/history.
// If you later want to re-enable expiry, add a TTL index here again.
// SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', SessionSchema);


