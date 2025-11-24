const crypto = require('crypto');
const BiometricKey = require('../../models/biometricKey');
const UsedToken = require('../../models/usedToken');
const challengeStore = require('./challengeStore');
const { verifySignaturePem } = require('./utils');

const DEFAULT_TTL = parseInt(process.env.BIOMETRIC_CHALLENGE_TTL || '60', 10);

class BiometricsService {
  static async requestEnable(userId) {
    const doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      await BiometricKey.create({ userId, status: 'pending', createdAt: new Date() });
      return;
    }
    doc.status = 'pending';
    doc.updatedAt = new Date();
    await doc.save();
  }

  static async getStatus(userId) {
    const doc = await BiometricKey.findOne({ userId });
    return doc ? doc.status : 'none';
  }

  static async adminApprove(userId) {
    const doc = await BiometricKey.findOneAndUpdate(
      { userId },
      { $set: { status: 'approved', updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    return doc;
  }

  static async registerKey(userId, publicKeyPem) {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') throw new Error('publicKeyPem required');

    // Upsert the biometric key record. When a device submits its OS-backed public key
    // it should be stored and marked 'pending' for admin approval (if not already approved).
    let doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      await BiometricKey.create({
        userId,
        publicKeyPem,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return;
    }

    // Update existing record: store new public key and set to pending unless already approved
    doc.publicKeyPem = publicKeyPem;
    if (doc.status !== 'approved') doc.status = 'pending';
    doc.updatedAt = new Date();
    await doc.save();
  }

  static async createChallenge(userId) {
    const challenge = crypto.randomBytes(32).toString('base64');
    // challengeStore.set may be async (Redis-backed) or sync (in-memory)
    await challengeStore.set(userId, challenge, DEFAULT_TTL);
    return challenge;
  }

  static async validateSignature(userId, challenge, signatureBase64) {
    // Check stored challenge
    const expected = await challengeStore.get(userId);
    if (!expected || expected !== challenge) {
      // mismatch -> revoke
      await BiometricsService.revoke(userId, 'challenge_mismatch');
      throw new Error('challenge_mismatch');
    }

    // Ensure not replayed (simple usedToken by hash of challenge+signature)
    const tokenHash = crypto.createHash('sha256').update(userId + '|' + challenge + '|' + signatureBase64).digest('hex');
    const used = await UsedToken.findOne({ tokenHash });
    if (used) {
      await BiometricsService.revoke(userId, 'replay_detected');
      throw new Error('replay_detected');
    }

    const keyDoc = await BiometricKey.findOne({ userId });
    if (!keyDoc || keyDoc.status !== 'approved' || !keyDoc.publicKeyPem) {
      throw new Error('no_key');
    }

    const ok = verifySignaturePem(keyDoc.publicKeyPem, challenge, signatureBase64);
    if (!ok) {
      await BiometricsService.revoke(userId, 'invalid_signature');
      throw new Error('invalid_signature');
    }

    // Mark token as used
    // Use DB unique index on tokenHash to make single-use tokens atomic across concurrent requests
    try {
      await UsedToken.create({ tokenHash, createdAt: new Date() });
    } catch (err) {
      // If insert fails due to duplicate key, treat as replay
      if (err.code === 11000) {
        await BiometricsService.revoke(userId, 'replay_detected');
        throw new Error('replay_detected');
      }
      throw err;
    }
    // Consume the challenge so it can't be re-used
    await challengeStore.delete(userId);
    return true;
  }

  static async revoke(userId, reason) {
    const doc = await BiometricKey.findOne({ userId });
    if (doc) {
      doc.status = 'revoked';
      doc.updatedAt = new Date();
      await doc.save();
    } else {
      await BiometricKey.create({ userId, status: 'revoked', createdAt: new Date(), updatedAt: new Date() });
    }
    // (Optional) log reason somewhere: prototype uses console
    console.warn(`Biometrics revoked for ${userId}: ${reason}`);
  }
}

module.exports = BiometricsService;
