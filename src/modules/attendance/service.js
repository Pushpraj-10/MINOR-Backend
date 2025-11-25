const BiometricsService = require('../biometrics/service');

class AttendanceService {
  // Return whether a public key is registered/approved and if so create a challenge
  static async checkKey(userId) {
    const pk = await BiometricsService.getPublicKey(userId);
    const publicKeyRegistered = !!pk.publicKeyPem && pk.status === 'approved';
    if (publicKeyRegistered) {
      const challenge = await BiometricsService.createChallenge(userId);
      return { publicKeyRegistered: true, challenge };
    }
    return { publicKeyRegistered: false };
  }

  static async registerKey(userId, publicKeyPem) {
    // Delegate to biometrics service which stores key and marks pending
    await BiometricsService.registerKey(userId, publicKeyPem);
  }

  static async verifyChallenge(userId, challenge, signature) {
    // Try to validate using biometrics service. If invalid, ensure key is deleted.
    try {
      const ok = await BiometricsService.validateSignature(userId, challenge, signature);
      return ok;
    } catch (err) {
      // If verification fails due to signature mismatch or challenge mismatch,
      // delete stored key to force re-registration and report biometricChanged.
      const msg = (err && err.message) ? err.message : '';
      if (msg === 'invalid_signature' || msg === 'challenge_mismatch' || msg === 'replay_detected') {
        await BiometricsService.revoke(userId, 'verify_failed_delete');
        // throw a specialized error to controller
        const e = new Error(msg);
        throw e;
      }
      throw err;
    }
  }
}

module.exports = AttendanceService;
