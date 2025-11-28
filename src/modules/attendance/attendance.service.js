const BiometricsService = require('../biometrics/biometrics.service');
const challengeStore = require('../biometrics/challengeStore');

class AttendanceService {
  // Return whether a public key is registered/approved and if so create a challenge
  // Key-check and registration functionality is handled by the
  // `biometrics` module (see `biometrics.service.js`). These methods were
  // intentionally removed from `AttendanceService` to avoid redundant
  // implementations and to keep responsibility centralized.

  static async verifyChallenge(userId, challenge, signature) {
    console.log(`attendance.verifyChallenge: user=${userId} challengeLen=${(challenge||'').length} sigLen=${(signature||'').length}`);
    
    try {
      // Delegate to biometrics service for validation
      const ok = await BiometricsService.validateSignature(userId, challenge, signature);
      console.log(`attendance.verifyChallenge: user=${userId} validation result=${ok}`);
      return { verified: ok };
    } catch (err) {
      const msg = (err && err.message) ? err.message : '';
      console.warn(`attendance.verifyChallenge: user=${userId} validation error=${msg}`);
      
      // Check if the key was revoked during validation
      const keyDoc = await require('../../models/biometricKey').findOne({ userId });
      const isRevoked = keyDoc && keyDoc.status === 'revoked';
      
      if (isRevoked) {
        console.warn(`attendance.verifyChallenge: user=${userId} key was revoked`);
        try { await challengeStore.delete(userId); } catch (_) {}
        return { verified: false, biometricChanged: true };
      }

      // For transient errors, don't revoke - just return the error
      if (msg === 'challenge_mismatch') {
        return { verified: false, reason: 'challenge_mismatch' };
      }

      // For serious security issues, the biometrics service already handled revocation
      if (msg === 'replay_detected' || msg === 'no_key') {
        return { verified: false, biometricChanged: true };
      }

      // For other errors (like invalid_signature), let biometrics service handle threshold logic
      return { verified: false, reason: msg };
    }
  }
}

module.exports = AttendanceService;
