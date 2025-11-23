const mongoose = require('mongoose');

const BiometricKeySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  publicKeyPem: { type: String, required: false },
  status: { type: String, enum: ['none', 'pending', 'approved', 'revoked'], default: 'none' },
  createdAt: { type: Date, required: true, default: () => new Date() },
  updatedAt: { type: Date, default: null },
});

BiometricKeySchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('BiometricKey', BiometricKeySchema);
