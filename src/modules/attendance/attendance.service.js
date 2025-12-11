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
      verified: doc.verified,
      note: doc.note || null
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
    if (new Date(sess.expiresAt).getTime() < Date.now()) throw new Error('session expired');

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
        try {
          const ok = await BiometricsService.validateSignature(studentUid, challenge, signature);
          if (!ok) throw new Error('biometric_validation_failed');
        } catch (err) {
          const msg = (err && err.message) ? err.message : '';
          if (msg === 'challenge_mismatch') {
            throw new Error('Biometric challenge expired or was already used. Please scan a fresh QR code.');
          }
          if (msg === 'replay_detected') {
            throw new Error('This biometric proof was already consumed. Ask the professor to refresh the QR and try again.');
          }
          if (msg === 'no_key') {
            throw new Error('No approved biometric key found. Re-register your device from the dashboard.');
          }
          throw err;
        }
      }

      // Upsert emulation for Firestore
      const existing = await Attendance.findOne(filter);
      let updated;
      if (!existing) {
        updated = await Attendance.create({
          sessionId: sess.sessionId,
          studentUid,
          timestamp: new Date(),
          verified: true,
          method: 'biometric',
        });
      } else {
        await Attendance.updateOne(filter, {
          $set: { timestamp: new Date(), verified: true, method: 'biometric' },
        });
        updated = await Attendance.findOne(filter);
      }
      return { ok: true, verified: true, attendance: AttendanceService.formatAttendance(updated) };
    }

    const existingVerified = await Attendance.findOne(filter);
    if (existingVerified && existingVerified.verified === true) {
      return { ok: true, verified: true, attendance: AttendanceService.formatAttendance(existingVerified) };
    }

    const user = await User.findOne({ uid: studentUid });
    if (!user) throw new Error('user not found');

    // Upsert emulation for Firestore
    const existing = await Attendance.findOne(filter);
    let result;
    if (!existing) {
      result = await Attendance.create({
        sessionId: sess.sessionId,
        studentUid,
        timestamp: new Date(),
        verified: false,
        method: 'qr',
      });
    } else {
      await Attendance.updateOne(filter, {
        $set: { timestamp: new Date(), verified: false, method: 'qr' },
      });
      result = await Attendance.findOne(filter);
    }
    return { ok: true, verified: result.verified, attendance: AttendanceService.formatAttendance(result) };
  }

  static async takeLeave(body = {}) {
    let { qrToken, sessionId, studentUid, reason } = body || {};

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
    if (new Date(sess.expiresAt).getTime() < Date.now()) throw new Error('session expired');

    if (sess.qrSeed) {
      if (!qrToken) throw new Error('qrToken required');
      const valid = AttendanceService.isRotatingTokenValid(qrToken, sess.qrSeed, sess.sessionId);
      if (!valid) throw new Error('invalid qr');
    } else if (sess.qrToken && qrToken && sess.qrToken !== qrToken) {
      throw new Error('invalid qr');
    }

    const filter = { sessionId: sess.sessionId, studentUid };
    // Upsert emulation for Firestore
    const existing = await Attendance.findOne(filter);
    let result;
    if (!existing) {
      result = await Attendance.create({
        sessionId: sess.sessionId,
        studentUid,
        timestamp: new Date(),
        verified: false,
        method: 'leave',
        note: reason || null,
      });
    } else {
      await Attendance.updateOne(filter, {
        $set: {
          timestamp: new Date(),
          verified: false,
          method: 'leave',
          note: reason || null,
        },
      });
      result = await Attendance.findOne(filter);
    }
    return { ok: true, attendance: AttendanceService.formatAttendance(result) };
  }

  static async getAttendanceStatistics(userId) {
    if (!userId) throw new Error('userId required');

    const user = await User.findOne({ uid: userId });
    const userBatch = user?.batch || null;

    // Fetch all sessions that have expired (cannot be marked anymore)
    const sessions = await Session.find({ expiresAt: { $lt: new Date() } });

    const filteredSessions = userBatch
      ? sessions.filter((s) => {
          const meta = s.meta || {};
          const mBatch = meta.batch;
          const mBatches = Array.isArray(meta.batches) ? meta.batches : [];
          const mAllowed = Array.isArray(meta.allowedBatches) ? meta.allowedBatches : [];
          if (mBatch && mBatch === userBatch) return true;
          if (mBatches.includes(userBatch)) return true;
          if (mAllowed.includes(userBatch)) return true;
          return false;
        })
      : sessions;

    // Map for quick lookup
    const sessionIds = filteredSessions.map((s) => s.sessionId);

    // Fetch attendance docs for this user for those sessions
    const attendance = await Attendance.find({
      studentUid: userId,
      sessionId: { $in: sessionIds },
    });

    const attendanceBySession = new Map();
    for (const doc of attendance) {
      attendanceBySession.set(doc.sessionId, doc);
    }

    const missedSessions = [];
    let attendedCount = 0;
    let leaveCount = 0;

    for (const sess of filteredSessions) {
      const att = attendanceBySession.get(sess.sessionId);
      if (att && att.method === 'leave') {
        leaveCount += 1;
        continue; // treated separately, not missed
      }
      if (att && att.verified === true) {
        attendedCount += 1;
        continue;
      }

      missedSessions.push({
        sessionId: sess.sessionId,
        title: sess.title || null,
        professorUid: sess.professorUid,
        expiredAt: sess.expiresAt,
      });
    }

    const total = filteredSessions.length;
    const denominator = Math.max(1, total - leaveCount); // exclude approved leaves from percentage
    const attendancePercent = (attendedCount / denominator) * 100;

    return {
      totalSessions: total,
      attended: attendedCount,
      leave: leaveCount,
      missed: missedSessions.length,
      attendancePercent,
      missedSessions,
    };
  }

  static async getUserAttendanceRecords(userId, { limit = 50, skip = 0 } = {}) {
    if (!userId) throw new Error('userId required');
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
    const safeSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const [recordsRaw, stats] = await Promise.all([
      Attendance.find({ studentUid: userId }),
      AttendanceService.getAttendanceStatistics(userId),
    ]);

    // Emulate sort/skip/limit client-side
    const recordsSorted = (recordsRaw || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const records = recordsSorted.slice(safeSkip, safeSkip + safeLimit);

    return {
      records: records.map(AttendanceService.formatAttendance),
      stats,
    };
  }

  static async listStudentsByBatch(batch, search, { limit = 200 } = {}) {
    if (!batch) throw new Error('batch_required');
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const query = { role: 'student', batch };
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: regex }, { email: regex }, { uid: regex }];
    }

    let users = await User.find(query);
    users = (users || [])
      .map(u => {
        const copy = { ...u };
        delete copy.passwordHash;
        return copy;
      })
      .sort((a, b) => {
        const an = (a.name || '').localeCompare(b.name || '');
        if (an !== 0) return an;
        return (a.email || '').localeCompare(b.email || '');
      })
      .slice(0, safeLimit);

    return users;
  }
}

module.exports = AttendanceService;