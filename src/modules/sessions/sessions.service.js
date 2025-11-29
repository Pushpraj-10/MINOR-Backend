const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Session = require('../../models/session');
const Attendance = require('../../models/attendance');
const User = require('../../models/user');
const BiometricsService = require('../biometrics/biometrics.service');


function authzProfessor(authorization) {
  if (!authorization) throw new Error('missing Authorization header');
  const token = authorization.replace('Bearer ', '');
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'defaultsecret');
  if (decoded.role !== 'professor') throw new Error('forbidden');
  return decoded;
}

class SessionsService {
  static async createSession(body, authorization) {
    const { title, durationMinutes = 30 } = body || {};
    const decoded = authzProfessor(authorization);
    const sessionId = 'sess_' + Date.now();
    // qrSeed is a cryptographically strong random value used to derive per-second rotating tokens
    const qrSeed = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const doc = await Session.create({ sessionId, professorUid: decoded.uid, title: title || null, qrSeed, createdAt: now, expiresAt });
    return { sessionId: doc.sessionId, expiresAt: doc.expiresAt };
  }

  static async checkin(body) {
    let { qrToken, studentUid, sessionId, method: authMethod, challenge, signature } = body || {};

    // Accept composite qrToken values in the form "<sessionId>:<token>"
    if ((!sessionId || sessionId === '') && typeof qrToken === 'string' && qrToken.includes(':')) {
      const parts = qrToken.split(':');
      if (parts.length >= 2 && parts[0].startsWith('sess_')) {
        sessionId = parts[0];
        qrToken = parts.slice(1).join(':');
      }
    }

    if (!studentUid) throw new Error('studentUid required');

    // Lookup session by sessionId or fallback to qrToken
    let sess = null;
    if (sessionId) sess = await Session.findOne({ sessionId });
    if (!sess && qrToken) sess = await Session.findOne({ qrToken });
    if (!sess) throw new Error('session not found');
    if (sess.expiresAt.getTime() < Date.now()) throw new Error('session expired');

    // If session uses rotating tokens, validate candidate
    if (sess.qrSeed) {
      if (!qrToken) throw new Error('qrToken required');
      const valid = SessionsService.isRotatingTokenValid(qrToken, sess.qrSeed, sess.sessionId);
      if (!valid) throw new Error('invalid qr');
    } else if (sess.qrToken && qrToken && sess.qrToken !== qrToken) {
      throw new Error('invalid qr');
    }

    // Biometric flow: require challenge+signature and verify via BiometricsService
    if (authMethod === 'biometric') {
      if (!challenge || !signature) throw new Error('challenge and signature required');
      const ok = await BiometricsService.validateSignature(studentUid, challenge, signature);
      if (!ok) throw new Error('biometric_validation_failed');

      const update = {
        $setOnInsert: { sessionId: sess.sessionId, studentUid },
        $set: { timestamp: new Date(), verified: true, method: 'biometric' },
      };

      const result = await Attendance.findOneAndUpdate(
        { sessionId: sess.sessionId, studentUid },
        update,
        { new: true, upsert: true }
      );
      return { ok: true, verified: true, attendance: { sessionId: result.sessionId, studentUid: result.studentUid, timestamp: result.timestamp, method: result.method, verified: result.verified } };
    }

    // Default QR flow: mark present (not verified by biometric)
    // If an attendance record already exists and is verified (e.g. by biometric),
    // do not overwrite it with a QR-based unverified entry.
    const existing = await Attendance.findOne({ sessionId: sess.sessionId, studentUid });
    if (existing && existing.verified === true) {
      return { ok: true, verified: true, attendance: { sessionId: existing.sessionId, studentUid: existing.studentUid, timestamp: existing.timestamp, method: existing.method, verified: existing.verified } };
    }

    const user = await User.findOne({ uid: studentUid });
    if (!user) throw new Error('user not found');

    const update = {
      $setOnInsert: { sessionId: sess.sessionId, studentUid },
      $set: { timestamp: new Date(), verified: false, method: 'qr' },
    };

    const result = await Attendance.findOneAndUpdate(
      { sessionId: sess.sessionId, studentUid },
      update,
      { new: true, upsert: true }
    );
    return { ok: true, verified: result.verified, attendance: { sessionId: result.sessionId, studentUid: result.studentUid, timestamp: result.timestamp, method: result.method, verified: result.verified } };
  }

  static async getProfessorSessions(authorization) {
    const decoded = authzProfessor(authorization);
    
    // Get all sessions created by this professor
    const sessions = await Session.find({ professorUid: decoded.uid })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to recent 50 sessions
    
    // For each session, get attendance statistics
    const sessionsWithStats = await Promise.all(
      sessions.map(async (session) => {
        // Count total attendance records for this session
        const totalAttendance = await Attendance.countDocuments({ sessionId: session.sessionId });
        
        // Count verified attendance (students who actually attended)
        const attendedStudents = await Attendance.countDocuments({ 
          sessionId: session.sessionId, 
          verified: true 
        });
        
        return {
          session_id: session.sessionId,
          title: session.title || 'Untitled Session',
          start_time: session.createdAt,
          end_time: session.expiresAt,
          total_students: totalAttendance,
          attended_students: attendedStudents
        };
      })
    );
    
    return { sessions: sessionsWithStats };
  }

  static async getSessionAttendance(sessionId, authorization) {
    const decoded = authzProfessor(authorization);
    
    // Verify the session belongs to this professor
    const session = await Session.findOne({ 
      sessionId, 
      professorUid: decoded.uid 
    });
    
    if (!session) {
      throw new Error('Session not found or access denied');
    }
    
    // Get all attendance records for this session
    const attendanceRecords = await Attendance.find({ sessionId })
      .sort({ timestamp: 1 });
    
    // Get student details for each attendance record
    const studentsWithAttendance = await Promise.all(
      attendanceRecords.map(async (record) => {
        const user = await User.findOne({ uid: record.studentUid });
        return {
          student_id: record.studentUid,
          name: user?.name || 'Unknown Student',
          email: user?.email || 'unknown@email.com',
          attendance_status: record.verified
        };
      })
    );
    
    return {
      session_id: sessionId,
      session_title: session.title || 'Untitled Session',
      students: studentsWithAttendance
    };
  }

  static async getAttendanceRaw(sessionId) {
    if (!sessionId) throw new Error('sessionId required');
    const list = await Attendance.find({ sessionId }).sort({ timestamp: 1 }).limit(1000);
    return { sessionId, count: list.length, attendance: list };
  }

  static deriveRotatingToken(qrSeed, sessionId, seconds) {
    const crypto = require('crypto');
    const h = crypto.createHmac('sha256', qrSeed + sessionId);
    h.update(String(seconds));
    // Shorten for QR compactness
    return h.digest('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  }

  static isRotatingTokenValid(candidate, qrSeed, sessionId) {
    const nowSec = Math.floor(Date.now() / 1000);
    // Configurable clock skew window in seconds (allowing for slower biometric/sign flows)
    const windowSec = parseInt(process.env.ROTATING_TOKEN_WINDOW_SECONDS || '5', 10);
    // Allow clock skew/window +/- windowSec seconds
    for (let s = nowSec - windowSec; s <= nowSec + windowSec; s++) {
      if (SessionsService.deriveRotatingToken(qrSeed, sessionId, s) === candidate) return true;
    }
    return false;
  }
}

module.exports = SessionsService;