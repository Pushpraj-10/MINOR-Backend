const BiometricsService = require('../biometrics/service');

class AttendanceService {
  // Return whether a public key is registered/approved and if so create a challenge
  static async checkKey(userId) {
    const pk = await BiometricsService.getPublicKey(userId);
    // Log what we received from biometrics service for debugging
    try {
      const storedLen = (pk['publicKeyPem'] || '').length;
      const storedPreview = (pk['publicKeyPem'] || '').replace(/\r?\n/g, '\\n').slice(0, 200);
      console.log(`attendance.checkKey: user=${userId} pkStatus=${pk.status} storedPemLen=${storedLen} storedPemPreview=${storedPreview}`);
    } catch (err) {
      console.warn('attendance.checkKey: failed to log pk preview', err);
    }

    const publicKeyRegistered = !!pk.publicKeyPem && pk.status === 'approved';
    if (publicKeyRegistered) {
      const challenge = await BiometricsService.createChallenge(userId);
      console.log(`attendance.checkKey: user=${userId} issuing challengeLen=${(challenge||'').length}`);
      return { publicKeyRegistered: true, challenge };
    }
    return { publicKeyRegistered: false };
  }

  static async registerKey(userId, publicKeyPem) {
    // Delegate to biometrics service which stores key and marks pending
    await BiometricsService.registerKey(userId, publicKeyPem);
  }

  static async verifyChallenge(userId, challenge, signature) {
    // Try to validate using biometrics service. We catch validation errors and
    // only report biometricChanged if the stored key was actually revoked.
    try {
      const ok = await BiometricsService.validateSignature(userId, challenge, signature);
      return { verified: ok };
    } catch (err) {
      const msg = (err && err.message) ? err.message : '';
      // Check the current key status to see if it was revoked
      const keyDoc = await require('../../models/biometricKey').findOne({ userId });
      const isRevoked = keyDoc && keyDoc.status === 'revoked';
      if (isRevoked) {
        return { verified: false, biometricChanged: true };
      }
      // Not revoked yet: return failure but do not signal biometricChanged
      return { verified: false, reason: msg };
    }
  }
}

module.exports = AttendanceService;
