const mongoose = require('mongoose');

const BiometricKeySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  publicKeyPem: { type: String, required: false },
  // Precomputed SHA-256 hex of normalized `publicKeyPem` to avoid sending PEM to clients
  publicKeyHash: { type: String, required: false },
  // When a new key is submitted while an approved key exists, keep it here
  pendingPublicKeyPem: { type: String, required: false },
  // Precomputed SHA-256 hex of normalized pending public key
  pendingPublicKeyHash: { type: String, required: false },
  pendingCreatedAt: { type: Date, default: null },
  status: { type: String, enum: ['none', 'pending', 'approved', 'revoked'], default: 'none' },
  // Track consecutive failed validation attempts to avoid immediate revocation
  failedAttempts: { type: Number, required: true, default: 0 },
  lastFailedAt: { type: Date, default: null },
  createdAt: { type: Date, required: true, default: () => new Date() },
  updatedAt: { type: Date, default: null },
});

// Note: `userId` is declared `unique: true` in the schema above.
// Avoid adding a duplicate index here to prevent Mongoose duplicate-index warnings.

module.exports = mongoose.model('BiometricKey', BiometricKeySchema);