const mongoose = require('mongoose');

const UsedTokenSchema = new mongoose.Schema({
  sessionId: { type: String, required: false },
  tokenHash: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

// TTL index to expire used tokens (replay protection)
UsedTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 });
// Explicit unique index on tokenHash to ensure DB-level uniqueness across deployments
UsedTokenSchema.index({ tokenHash: 1 }, { unique: true, background: true });

module.exports = mongoose.model('UsedToken', UsedTokenSchema);
