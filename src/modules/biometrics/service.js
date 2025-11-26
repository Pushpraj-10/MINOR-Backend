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
    // Move any pendingPublicKeyPem into the active publicKeyPem on admin approval.
    let doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      // Create approved record without a public key (admin can approve later when a key exists)
      doc = await BiometricKey.create({ userId, status: 'approved', failedAttempts: 0, lastFailedAt: null, createdAt: new Date(), updatedAt: new Date() });
      console.log(`biometrics.adminApprove: user=${userId} created approved record (no pem)`);
      return doc;
    }

    // If there is a pending key, promote it to the active publicKeyPem
    if (doc.pendingPublicKeyPem) {
      console.log(`biometrics.adminApprove: user=${userId} promoting pending key to approved pemLen=${(doc.pendingPublicKeyPem||'').length}`);
      doc.publicKeyPem = doc.pendingPublicKeyPem;
      doc.publicKeyHash = doc.pendingPublicKeyHash || null;
      doc.pendingPublicKeyPem = null;
      doc.pendingPublicKeyHash = null;
      doc.pendingCreatedAt = null;
    } else {
      console.log(`biometrics.adminApprove: user=${userId} approving existing key pemLen=${(doc.publicKeyPem||'').length}`);
    }
    doc.status = 'approved';
    doc.failedAttempts = 0;
    doc.lastFailedAt = null;
    doc.updatedAt = new Date();
    await doc.save();
    // Clear any ephemeral challenge for this user after admin approval
    try { await challengeStore.delete(userId); } catch (_) {}
    return doc;
  }

  static async registerKey(userId, publicKeyPem) {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') throw new Error('publicKeyPem required');

    // Upsert the biometric key record. When a device submits its OS-backed public key
    // it should be stored and marked 'pending' for admin approval (if not already approved).
    let doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      console.log(`biometrics.registerKey: creating key for user=${userId} pemLen=${(publicKeyPem||'').length}`);
      // compute hash
      const normalize = (s) => (s || '').replace(/\s+/g, '').trim();
      let publicKeyHash = null;
      try {
        publicKeyHash = crypto.createHash('sha256').update(normalize(publicKeyPem)).digest('hex');
      } catch (err) {
        console.warn(`biometrics.registerKey: user=${userId} failed to compute publicKeyHash`, err);
      }
      await BiometricKey.create({
        userId,
        publicKeyPem,
        publicKeyHash,
        status: 'pending',
        failedAttempts: 0,
        lastFailedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Clear any ephemeral challenge for this user to avoid stale challenges
      try { await challengeStore.delete(userId); } catch (_) {}
      return;
    }

    // If there is an approved key, do not overwrite it immediately. Instead, store the incoming key
    // as a pendingPublicKeyPem so admin can review and promote it.
    const normalize = (s) => (s || '').replace(/\s+/g, '').trim();
    const stored = doc.publicKeyPem || '';
    const nStored = normalize(stored);
    const nIncoming = normalize(publicKeyPem);

    if (doc.status === 'approved') {
      if (nStored === nIncoming) {
        console.log(`biometrics.registerKey: user=${userId} submitted same approved key -> no-op`);
        return;
      }
      // If an identical pending already exists, no-op
      const nPending = normalize(doc.pendingPublicKeyPem || '');
      if (nPending === nIncoming) {
        console.log(`biometrics.registerKey: user=${userId} pending key already exists -> no-op`);
        return;
      }
      // Otherwise store as pending and do not overwrite the active approved key
      let pendingHash = null;
      try {
        pendingHash = crypto.createHash('sha256').update(nIncoming).digest('hex');
      } catch (err) {
        console.warn(`biometrics.registerKey: user=${userId} failed to compute pendingPublicKeyHash`, err);
      }
      doc.pendingPublicKeyPem = publicKeyPem;
      doc.pendingPublicKeyHash = pendingHash;
      doc.pendingCreatedAt = new Date();
      doc.updatedAt = new Date();
      console.log(`biometrics.registerKey: user=${userId} created pendingPublicKeyPem pemLen=${(publicKeyPem||'').length} (existing approved key preserved)`);
      await doc.save();
      // Clear any ephemeral challenge for this user to avoid stale challenges
      try { await challengeStore.delete(userId); } catch (_) {}
      return;
    }

    // Update existing record for non-approved states: overwrite publicKeyPem and set to pending
    console.log(`biometrics.registerKey: updating key for user=${userId} oldStatus=${doc.status} pemLen=${(publicKeyPem||'').length}`);
    // compute hash for stored key
    let publicKeyHash = null;
    try {
      publicKeyHash = crypto.createHash('sha256').update(nIncoming).digest('hex');
    } catch (err) {
      console.warn(`biometrics.registerKey: user=${userId} failed to compute publicKeyHash`, err);
    }
    doc.publicKeyPem = publicKeyPem;
    doc.publicKeyHash = publicKeyHash;
    // Reset failure counters when a new key is registered
    doc.failedAttempts = 0;
    doc.lastFailedAt = null;
    doc.status = 'pending';
    doc.pendingPublicKeyPem = null;
    doc.pendingPublicKeyHash = null;
    doc.pendingCreatedAt = null;
    doc.updatedAt = new Date();
    await doc.save();
    // Clear any ephemeral challenge for this user to avoid stale challenges
    try { await challengeStore.delete(userId); } catch (_) {}
  }

  static async getPublicKey(userId) {
    // Single read; if missing, log once for debugging (no retry)
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
    // Ensure publicKeyHash is available for older records that may lack it
    let publicKeyHash = doc.publicKeyHash || null;
    if (!publicKeyHash && doc.publicKeyPem) {
      try {
        const normalize = (s) => (s || '').replace(/\s+/g, '').trim();
        publicKeyHash = crypto.createHash('sha256').update(normalize(doc.publicKeyPem)).digest('hex');
        // persist the computed hash to avoid future recompute
        try {
          doc.publicKeyHash = publicKeyHash;
          doc.updatedAt = new Date();
          // Save asynchronously but don't block caller on failures
          doc.save().catch(() => {});
        } catch (_) {}
      } catch (err) {
        console.warn(`biometrics.getPublicKey: failed to compute publicKeyHash for user=${userId}`, err);
      }
    }

    return {
      publicKeyPem: doc.publicKeyPem || null,
      status: doc.status || 'none',
      publicKeyHash: publicKeyHash,
      pendingPublicKeyHash: doc.pendingPublicKeyHash || null,
      updatedAt: doc.updatedAt,
    };
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
    console.log(`Stored key ${nStored} and incoming key ${nIncoming} match: ${match}`);
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
    // Final verification log (explicit marker for successful signature validation)
    try {
      console.log(`biometrics.finalVerification: user=${userId} verified=true challengeLen=${(challenge||'').length} signatureLen=${(signatureBase64||'').length}`);
    } catch (_) {}
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
    // Clear ephemeral challenge for this user immediately
    try { await challengeStore.delete(userId); } catch (_) {}
    // (Optional) log reason somewhere: prototype uses console
    console.warn(`Biometrics revoked for ${userId}: ${reason}`);
  }
}

module.exports = BiometricsService;