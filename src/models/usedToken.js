const mongoose = require('mongoose');

const UsedTokenSchema = new mongoose.Schema({
  sessionId: { type: String, required: false },
  tokenHash: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

// TTL index to expire used tokens (replay protection)
UsedTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 });
// Note: `tokenHash` is declared `unique: true` in the schema above.
// Avoid adding a duplicate index here to prevent Mongoose duplicate-index warnings.

module.exports = mongoose.model('UsedToken', UsedTokenSchema);
