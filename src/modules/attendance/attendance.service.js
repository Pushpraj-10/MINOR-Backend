const BiometricsService = require('../biometrics/biometrics.service');
const challengeStore = require('../biometrics/challengeStore');

class AttendanceService {
  static async verifyChallenge(userId, challenge, signature) {
    console.log(`attendance.verifyChallenge: user=${userId} challengeLen=${(challenge||'').length} sigLen=${(signature||'').length}`);
    try {
      const ok = await BiometricsService.validateSignature(userId, challenge, signature);
      return { verified: ok };
    } catch (err) {
      const msg = (err && err.message) ? err.message : '';
      const keyDoc = await require('../../models/biometricKey').findOne({ userId });
      const isRevoked = keyDoc && keyDoc.status === 'revoked';

      if (isRevoked) {
        try { await challengeStore.delete(userId); } catch (_) {}
        return { verified: false, biometricChanged: true };
      }
      if (msg === 'challenge_mismatch') return { verified: false, reason: 'challenge_mismatch' };
      if (msg === 'replay_detected' || msg === 'no_key') return { verified: false, biometricChanged: true };
      return { verified: false, reason: msg };
    }
  }
}

module.exports = AttendanceService;
