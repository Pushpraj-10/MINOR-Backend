const crypto = require('crypto');
const Session = require('../../models/session');
const Attendance = require('../../models/attendance');
const User = require('../../models/user');
const BiometricsService = require('../biometrics/biometrics.service');
const challengeStore = require('../challenge/challenge.service');

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

  static deriveRotatingToken(qrSeed, sessionId, seconds) {
    const h = crypto.createHmac('sha256', qrSeed + sessionId);
    h.update(String(seconds));
    return h.digest('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  }

  static isRotatingTokenValid(candidate, qrSeed, sessionId) {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowSec = parseInt(process.env.ROTATING_TOKEN_WINDOW_SECONDS || '5', 10);
    for (let s = nowSec - windowSec; s <= nowSec + windowSec; s++) {
      if (AttendanceService.deriveRotatingToken(qrSeed, sessionId, s) === candidate) return true;
    }
    return false;
  }

  static formatAttendance(doc) {
    if (!doc) return null;
    return {
      sessionId: doc.sessionId,
      studentUid: doc.studentUid,
      timestamp: doc.timestamp,
      method: doc.method,
      verified: doc.verified
    };
  }

  static async recordAttendance(body, options = {}) {
    let { qrToken, studentUid, sessionId, method: authMethod, challenge, signature } = body || {};
    const { skipBiometricValidation = false } = options || {};

    if ((!sessionId || sessionId === '') && typeof qrToken === 'string' && qrToken.includes(':')) {
      const parts = qrToken.split(':');
      if (parts.length >= 2 && parts[0].startsWith('sess_')) {
        sessionId = parts[0];
        qrToken = parts.slice(1).join(':');
      }
    }

    if (!studentUid) throw new Error('studentUid required');

    let sess = null;
    if (sessionId) sess = await Session.findOne({ sessionId });
    if (!sess && qrToken) sess = await Session.findOne({ qrToken });
    if (!sess) throw new Error('session not found');
    if (sess.expiresAt.getTime() < Date.now()) throw new Error('session expired');

    if (sess.qrSeed) {
      if (!qrToken) throw new Error('qrToken required');
      const valid = AttendanceService.isRotatingTokenValid(qrToken, sess.qrSeed, sess.sessionId);
      if (!valid) throw new Error('invalid qr');
    } else if (sess.qrToken && qrToken && sess.qrToken !== qrToken) {
      throw new Error('invalid qr');
    }

    const filter = { sessionId: sess.sessionId, studentUid };

    if (authMethod === 'biometric') {
      if (!skipBiometricValidation && (!challenge || !signature)) {
        const existing = await Attendance.findOne(filter);
        if (existing && existing.verified === true) {
          return { ok: true, verified: true, attendance: AttendanceService.formatAttendance(existing) };
        }
        throw new Error('challenge and signature required');
      }

      if (!skipBiometricValidation) {
        const ok = await BiometricsService.validateSignature(studentUid, challenge, signature);
        if (!ok) throw new Error('biometric_validation_failed');
      }

      const update = {
        $setOnInsert: { sessionId: sess.sessionId, studentUid },
        $set: { timestamp: new Date(), verified: true, method: 'biometric' }
      };

      const result = await Attendance.findOneAndUpdate(filter, update, { new: true, upsert: true });
      return { ok: true, verified: true, attendance: AttendanceService.formatAttendance(result) };
    }

    const existingVerified = await Attendance.findOne(filter);
    if (existingVerified && existingVerified.verified === true) {
      return { ok: true, verified: true, attendance: AttendanceService.formatAttendance(existingVerified) };
    }

    const user = await User.findOne({ uid: studentUid });
    if (!user) throw new Error('user not found');

    const update = {
      $setOnInsert: { sessionId: sess.sessionId, studentUid },
      $set: { timestamp: new Date(), verified: false, method: 'qr' }
    };

    const result = await Attendance.findOneAndUpdate(filter, update, { new: true, upsert: true });
    return { ok: true, verified: result.verified, attendance: AttendanceService.formatAttendance(result) };
  }
}

module.exports = AttendanceService;
