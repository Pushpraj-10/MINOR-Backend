const crypto = require('crypto');
const BiometricKey = require('../../models/biometricKey');
const UsedToken = require('../../models/usedToken');
const challengeStore = require('./challengeStore');
const { verifySignaturePem } = require('./biometrics.utils');

const DEFAULT_TTL = parseInt(process.env.BIOMETRIC_CHALLENGE_TTL || '60', 10);
const FAILED_ATTEMPTS_THRESHOLD = parseInt(process.env.BIOMETRIC_FAILED_ATTEMPTS_THRESHOLD || '5', 10);

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
    try {
      const doc = await BiometricKey.findOne({ userId });
      const status = doc ? doc.status : 'none';
      console.log(`biometrics.getStatus: user=${userId} status=${status} hasDoc=${!!doc}`);
      return status;
    } catch (err) {
      console.error(`biometrics.getStatus: user=${userId} error=${err.message}`);
      return 'none';
    }
  }

  static async adminApprove(userId) {
    let doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      doc = await BiometricKey.create({
        userId,
        status: 'approved',
        failedAttempts: 0,
        lastFailedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`biometrics.adminApprove: user=${userId} created approved record (no pem)`);
      return doc;
    }

    // Promote pending → active if present
    if (doc.pendingPublicKeyPem) {
      console.log(`biometrics.adminApprove: user=${userId} promoting pending key (len=${(doc.pendingPublicKeyPem||'').length})`);
      doc.publicKeyPem = doc.pendingPublicKeyPem;
      doc.publicKeyHash = doc.pendingPublicKeyHash || null;
      doc.pendingPublicKeyPem = null;
      doc.pendingPublicKeyHash = null;
      doc.pendingCreatedAt = null;
    }
    doc.status = 'approved';
    doc.failedAttempts = 0;
    doc.lastFailedAt = null;
    doc.updatedAt = new Date();
    await doc.save();
    try { await challengeStore.delete(userId); } catch (_) {}
    return doc;
  }

  /**
   * A2 policy:
   * - If user submits a key different from the current APPROVED key:
   *   * DELETE the old approved key immediately (set publicKeyPem/publicKeyHash = null)
   *   * Store the incoming as pendingPublicKey*
   *   * Set status='pending' → requires admin approval again
   * - If same key: no-op
   * - If not approved: overwrite active key and set status='pending'
   */
  static async registerKey(userId, publicKeyPem) {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') throw new Error('publicKeyPem required');

    const normalize = (s) => (s || '').replace(/\s+/g, '').trim();

    let doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      console.log(`biometrics.registerKey: create doc user=${userId} pemLen=${(publicKeyPem||'').length}`);
      let publicKeyHash = null;
      try { publicKeyHash = crypto.createHash('sha256').update(normalize(publicKeyPem)).digest('hex'); } catch {}
      await BiometricKey.create({
        userId,
        publicKeyPem,             // store as active (first-time) BUT status pending
        publicKeyHash,
        status: 'pending',
        failedAttempts: 0,
        lastFailedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      try { await challengeStore.delete(userId); } catch (_) {}
      return;
    }

    const nIncoming = normalize(publicKeyPem);
    const nStored   = normalize(doc.publicKeyPem || '');
    const nPending  = normalize(doc.pendingPublicKeyPem || '');

    if (doc.status === 'approved') {
      if (nStored && nStored === nIncoming) {
        console.log(`biometrics.registerKey: user=${userId} same approved key → no-op`);
        return;
      }
      if (nPending && nPending === nIncoming) {
        console.log(`biometrics.registerKey: user=${userId} same pending key → no-op`);
        return;
      }

      // Different key: DELETE old approved key immediately,
      // set incoming as PENDING and force status='pending'.
      let pendingHash = null;
      try { pendingHash = crypto.createHash('sha256').update(nIncoming).digest('hex'); } catch {}

      doc.publicKeyPem = null;
      doc.publicKeyHash = null;
      doc.pendingPublicKeyPem = publicKeyPem;
      doc.pendingPublicKeyHash = pendingHash;
      doc.pendingCreatedAt = new Date();
      doc.status = 'pending';
      doc.failedAttempts = 0;
      doc.lastFailedAt = null;
      doc.updatedAt = new Date();
      await doc.save();

      try { await challengeStore.delete(userId); } catch (_) {}
      console.log(`biometrics.registerKey: user=${userId} different key → old deleted, pending set, status=pending`);
      return;
    }

    // Not approved states: overwrite active key, set to pending
    console.log(`biometrics.registerKey: user=${userId} state=${doc.status} overwrite → pending`);
    let publicKeyHash = null;
    try { publicKeyHash = crypto.createHash('sha256').update(nIncoming).digest('hex'); } catch {}
    doc.publicKeyPem = publicKeyPem;
    doc.publicKeyHash = publicKeyHash;
    doc.pendingPublicKeyPem = null;
    doc.pendingPublicKeyHash = null;
    doc.pendingCreatedAt = null;
    doc.status = 'pending';
    doc.failedAttempts = 0;
    doc.lastFailedAt = null;
    doc.updatedAt = new Date();
    await doc.save();
    try { await challengeStore.delete(userId); } catch (_) {}
  }

  static async getPublicKey(userId) {
    const doc = await BiometricKey.findOne({ userId });
    if (!doc) {
      console.log(`biometrics.getPublicKey: user=${userId} no doc`);
      return { publicKeyPem: null, status: 'none' };
    }
    try {
      const preview = (doc.publicKeyPem || '').replace(/\r?\n/g, '\\n').slice(0, 200);
      console.log(`biometrics.getPublicKey: user=${userId} status=${doc.status} pemLen=${(doc.publicKeyPem||'').length} preview=${preview}`);
    } catch {}
    let publicKeyHash = doc.publicKeyHash || null;
    if (!publicKeyHash && doc.publicKeyPem) {
      try {
        publicKeyHash = crypto.createHash('sha256')
          .update((doc.publicKeyPem || '').replace(/\s+/g, '').trim())
          .digest('hex');
        doc.publicKeyHash = publicKeyHash;
        doc.updatedAt = new Date();
        doc.save().catch(() => {});
      } catch {}
    }
    return {
      publicKeyPem: doc.publicKeyPem || null,
      status: doc.status || 'none',
      publicKeyHash,
      pendingPublicKeyHash: doc.pendingPublicKeyHash || null,
      updatedAt: doc.updatedAt
    };
  }

  static async checkKey(userId, publicKeyPem) {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') throw new Error('publicKeyPem required');
    const doc = await BiometricKey.findOne({ userId });
    if (!doc || !doc.publicKeyPem) return false;
    const normalize = (s) => (s || '').replace(/\s+/g, '').trim();
    const match = normalize(doc.publicKeyPem) === normalize(publicKeyPem);
    console.log(`biometrics.checkKey: user=${userId} match=${match}`);
    return match;
  }

  static async createChallenge(userId) {
    const keyDoc = await BiometricKey.findOne({ userId });
    if (!keyDoc || keyDoc.status !== 'approved' || !keyDoc.publicKeyPem) {
      throw new Error(`Cannot create challenge: user=${userId} status=${keyDoc?.status || 'none'} hasPem=${!!keyDoc?.publicKeyPem}`);
    }
    const challenge = crypto.randomBytes(32).toString('base64');
    await challengeStore.set(userId, challenge, DEFAULT_TTL);
    console.log(`biometrics.createChallenge: user=${userId} challengeLen=${challenge.length}`);
    return challenge;
  }

  static async validateSignature(userId, challenge, signatureBase64) {
    const expected = await challengeStore.get(userId);
    if (!expected || expected !== challenge) {
      console.warn(`biometrics.validateSignature: user=${userId} challenge_mismatch expected=${!!expected} match=${expected === challenge}`);
      throw new Error('challenge_mismatch');
    }

    const tokenHash = crypto.createHash('sha256')
      .update(userId + '|' + challenge + '|' + signatureBase64)
      .digest('hex');
    const used = await UsedToken.findOne({ tokenHash });
    if (used) {
      console.warn(`biometrics.validateSignature: user=${userId} replay_detected`);
      await BiometricsService.revoke(userId, 'replay_detected');
      throw new Error('replay_detected');
    }

    const keyDoc = await BiometricKey.findOne({ userId });
    if (!keyDoc || keyDoc.status !== 'approved' || !keyDoc.publicKeyPem) {
      console.warn(`biometrics.validateSignature: user=${userId} no_key status=${keyDoc?.status} hasPem=${!!keyDoc?.publicKeyPem}`);
      throw new Error('no_key');
    }

    const ok = verifySignaturePem(keyDoc.publicKeyPem, challenge, signatureBase64);
    if (!ok) {
      keyDoc.failedAttempts = (keyDoc.failedAttempts || 0) + 1;
      keyDoc.lastFailedAt = new Date();
      await keyDoc.save();

      if (keyDoc.failedAttempts >= FAILED_ATTEMPTS_THRESHOLD) {
        console.warn(`biometrics.validateSignature: user=${userId} threshold reached → revoke`);
        await BiometricsService.revoke(userId, `invalid_signature_threshold_${keyDoc.failedAttempts}`);
      }
      throw new Error('invalid_signature');
    }

    if (keyDoc.failedAttempts && keyDoc.failedAttempts > 0) {
      keyDoc.failedAttempts = 0;
      keyDoc.lastFailedAt = null;
      keyDoc.updatedAt = new Date();
      await keyDoc.save();
    }

    try {
      await UsedToken.create({ tokenHash, createdAt: new Date() });
    } catch (err) {
      if (err.code === 11000) {
        await BiometricsService.revoke(userId, 'replay_detected');
        throw new Error('replay_detected');
      }
      throw err;
    }

    console.log(`biometrics.finalVerification: user=${userId} verified=true`);
    return true;
  }

  static async revoke(userId, reason) {
    const doc = await BiometricKey.findOne({ userId });
    if (doc) {
      doc.publicKeyPem = null;
      doc.publicKeyHash = null;
      doc.pendingPublicKeyPem = null;
      doc.pendingPublicKeyHash = null;
      doc.pendingCreatedAt = null;
      doc.status = 'revoked';
      doc.updatedAt = new Date();
      await doc.save();
    } else {
      await BiometricKey.create({ userId, status: 'revoked', createdAt: new Date(), updatedAt: new Date() });
    }
    try { await challengeStore.delete(userId); } catch (_) {}
    console.warn(`Biometrics revoked for ${userId}: ${reason}`);
  }

  static async deleteKey(userId) {
    const keyDoc = await BiometricKey.findOne({ userId });
    if (keyDoc) {
      keyDoc.publicKeyPem = null;
      keyDoc.publicKeyHash = null;
      keyDoc.pendingPublicKeyPem = null;
      keyDoc.pendingPublicKeyHash = null;
      keyDoc.status = 'deleted';
      keyDoc.updatedAt = new Date();
      await keyDoc.save();
    }
  }
}

module.exports = BiometricsService;
