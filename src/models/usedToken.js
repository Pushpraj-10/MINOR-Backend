const mongoose = require('mongoose');

const UsedTokenSchema = new mongoose.Schema({
  sessionId: { type: String, required: false },
  tokenHash: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

// TTL index to expire used tokens (replay protection)
UsedTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 });
// Unique index on tokenHash enforces single-use tokens atomically at DB level
UsedTokenSchema.index({ tokenHash: 1 }, { unique: true });

module.exports = mongoose.model('UsedToken', UsedTokenSchema);
