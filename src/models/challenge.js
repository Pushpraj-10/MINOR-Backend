const mongoose = require('mongoose');

const ChallengeSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  challenge: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() },
});

// Ensure stale documents are removed automatically once expiresAt is in the past
ChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Challenge', ChallengeSchema);
