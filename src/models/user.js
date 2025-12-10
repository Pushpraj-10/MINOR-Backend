const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  role: { type: String, enum: ['student', 'professor', 'admin'], required: true },
  email: { type: String, required: true, unique: true },
  name: { type: String },
  passwordHash: { type: String },
  batch: { type: String, default: null }, //For students it's their batch & for professors it's the batch they teach
  createdAt: { type: Date, required: true, default: () => new Date() },
  updatedAt: { type: Date, default: null },
});

// Unique indexes are already defined via schema paths (unique: true)
UserSchema.index({ role: 1 });

module.exports = mongoose.model('User', UserSchema);