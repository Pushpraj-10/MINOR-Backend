const crypto = require('crypto');
const BiometricKey = require('../../models/biometricKey');
const UsedToken = require('../../models/usedToken');
const challengeStore = require('./challengeStore');
const { verifySignaturePem } = require('./utils');

const DEFAULT_TTL = parseInt(process.env.BIOMETRIC_CHALLENGE_TTL || '60', 10);
const FAILED_ATTEMPTS_THRESHOLD = parseInt(process.env.BIOMETRIC_FAILED_ATTEMPTS_THRESHOLD || '3', 10);

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
      { $set: { status: 'approved', updatedAt: new Date(), failedAttempts: 0, lastFailedAt: null } },
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
      console.log(`biometrics.registerKey: creating key for user=${userId} pemLen=${(publicKeyPem||'').length}`);
      await BiometricKey.create({
        userId,
        publicKeyPem,
        status: 'pending',
        failedAttempts: 0,
        lastFailedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return;
    }

    // Update existing record: store new public key and set to pending unless already approved
    console.log(`biometrics.registerKey: updating key for user=${userId} oldStatus=${doc.status} pemLen=${(publicKeyPem||'').length}`);
    doc.publicKeyPem = publicKeyPem;
    // Reset failure counters when a new key is registered
    doc.failedAttempts = 0;
    doc.lastFailedAt = null;
    if (doc.status !== 'approved') doc.status = 'pending';
    doc.updatedAt = new Date();
    await doc.save();
  }

  static async getPublicKey(userId) {
    const doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      console.log(`biometrics.getPublicKey: user=${userId} no doc`);
      return { publicKeyPem: null, status: 'none' };
    }
    try {
      const preview = (doc.publicKeyPem || '').replace(/\r?\n/g, '\\n').slice(0, 200);
      console.log(`biometrics.getPublicKey: user=${userId} status=${doc.status} storedPemLen=${(doc.publicKeyPem||'').length} storedPemPreview=${preview}`);
    } catch (logErr) {
      console.warn('biometrics.getPublicKey: failed to log preview', logErr);
    }
    return { publicKeyPem: doc.publicKeyPem || null, status: doc.status || 'none', updatedAt: doc.updatedAt };
  }

  static async checkKey(userId, publicKeyPem) {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') throw new Error('publicKeyPem required');
    const doc = await BiometricKey.findOne({ userId });
    console.log(`biometrics.checkKey: user=${userId} incomingPemLen=${(publicKeyPem||'').length}`);
    if (publicKeyPem) {
      const preview = publicKeyPem.replace(/\r?\n/g, '\\n').slice(0, 200);
      console.log(`biometrics.checkKey: user=${userId} incomingPemPreview=${preview}`);
    }
    if (!doc || !doc.publicKeyPem) {
      console.log(`biometrics.checkKey: user=${userId} no stored key`);
      return false;
    }
    // Normalize whitespace for comparison
    const normalize = (s) => (s || '').replace(/\s+/g, '').trim();
    const stored = doc.publicKeyPem || '';
    console.log(`biometrics.checkKey: user=${userId} storedPemLen=${stored.length}`);
    const storedPreview = stored.replace(/\r?\n/g, '\\n').slice(0, 200);
    console.log(`biometrics.checkKey: user=${userId} storedPemPreview=${storedPreview}`);
    const nStored = normalize(stored);
    const nIncoming = normalize(publicKeyPem);
    console.log(`biometrics.checkKey: user=${userId} normalizedStoredLen=${nStored.length} normalizedIncomingLen=${nIncoming.length}`);
    const match = nStored === nIncoming;
    console.log(`biometrics.checkKey: user=${userId} match=${match}`);
    return match;
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
      try {
        const expectedPreview = String(expected || '').slice(0, 120);
        const providedPreview = String(challenge || '').slice(0, 120);
        const expectedHex = Buffer.from(String(expected || ''), 'base64').slice(0, 12).toString('hex');
        console.warn(`biometrics.validateSignature: user=${userId} challenge_mismatch expectedLen=${(expected||'').length} providedLen=${(challenge||'').length} expectedPreview=${expectedPreview} providedPreview=${providedPreview} expectedHexPrefix=${expectedHex}`);
      } catch (logErr) {
        console.warn(`biometrics.validateSignature: user=${userId} challenge_mismatch unable to log previews: ${logErr}`);
      }
      // Increment failure counter and only revoke after threshold
      const doc = await BiometricKey.findOne({ userId });
      if (doc) {
        doc.failedAttempts = (doc.failedAttempts || 0) + 1;
        doc.lastFailedAt = new Date();
        await doc.save();
        if (doc.failedAttempts >= FAILED_ATTEMPTS_THRESHOLD) {
          await BiometricsService.revoke(userId, 'challenge_mismatch');
        }
      }
      throw new Error('challenge_mismatch');
    }

    // Ensure not replayed (simple usedToken by hash of challenge+signature)
    const tokenHash = crypto.createHash('sha256').update(userId + '|' + challenge + '|' + signatureBase64).digest('hex');
    const used = await UsedToken.findOne({ tokenHash });
    if (used) {
      console.warn(`biometrics.validateSignature: user=${userId} replay_detected tokenHash=${tokenHash}`);
      // Replay is severe: treat as immediate revoke
      await BiometricsService.revoke(userId, 'replay_detected');
      throw new Error('replay_detected');
    }

    const keyDoc = await BiometricKey.findOne({ userId });
    console.log(`biometrics.validateSignature: user=${userId} keyStatus=${keyDoc?.status} failedAttempts=${keyDoc?.failedAttempts || 0}`);
    if (!keyDoc || keyDoc.status !== 'approved' || !keyDoc.publicKeyPem) {
      console.warn(`biometrics.validateSignature: user=${userId} no_key status=${keyDoc?.status} hasPem=${!!keyDoc?.publicKeyPem}`);
      throw new Error('no_key');
    }

    // Log signature and stored key previews for debugging
    try {
      console.log(`biometrics.validateSignature: user=${userId} signatureLen=${(signatureBase64||'').length}`);
      if (signatureBase64) {
        console.log(`biometrics.validateSignature: user=${userId} signaturePreview=${signatureBase64.slice(0, 80)}`);
      }
      const sp = (keyDoc.publicKeyPem || '').replace(/\r?\n/g, '\\n').slice(0, 200);
      console.log(`biometrics.validateSignature: user=${userId} storedPemPreview=${sp}`);
    } catch (logErr) {
      console.warn('biometrics.validateSignature: failed to log signature/key preview', logErr);
    }

    const ok = verifySignaturePem(keyDoc.publicKeyPem, challenge, signatureBase64);
    if (ok) {
      console.log(`biometrics.validateSignature: user=${userId} signature_valid success resetting failedAttempts`);
    } else {
      console.warn(`biometrics.validateSignature: user=${userId} signature verification returned false`);
    }
    if (!ok) {
      console.warn(`biometrics.validateSignature: user=${userId} invalid_signature signatureLen=${(signatureBase64||'').length}`);
      // Increment failure counter and revoke only after threshold to avoid noisy re-registration
      keyDoc.failedAttempts = (keyDoc.failedAttempts || 0) + 1;
      keyDoc.lastFailedAt = new Date();
      await keyDoc.save();
      console.warn(`biometrics.validateSignature: user=${userId} invalid_signature failedAttempts=${keyDoc.failedAttempts}`);
      if (keyDoc.failedAttempts >= FAILED_ATTEMPTS_THRESHOLD) {
        console.warn(`biometrics.validateSignature: user=${userId} reached threshold -> revoking`);
        await BiometricsService.revoke(userId, 'invalid_signature');
      }
      throw new Error('invalid_signature');
    }

    // On success, reset failure counter
    if (keyDoc.failedAttempts && keyDoc.failedAttempts > 0) {
      keyDoc.failedAttempts = 0;
      keyDoc.lastFailedAt = null;
      keyDoc.updatedAt = new Date();
      await keyDoc.save();
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
      // Delete the stored public key so the device key is no longer trusted,
      // but keep a record for audit with status 'revoked'.
      doc.publicKeyPem = null;
      doc.status = 'revoked';
      doc.updatedAt = new Date();
      await doc.save();
    } else {
      // Create a minimal revoked record for auditing
      await BiometricKey.create({ userId, status: 'revoked', createdAt: new Date(), updatedAt: new Date() });
    }
    // (Optional) log reason somewhere: prototype uses console
    console.warn(`Biometrics revoked for ${userId}: ${reason}`);
  }
}

module.exports = BiometricsService;
