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
    const now = new Date();

    // Enforce daily limits: max two sessions per day
    const dayStart = new Date(now); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(now); dayEnd.setHours(23,59,59,999);
    const sessionsToday = await Session.find({
      professorUid: decoded.uid,
      createdAt: { $gte: dayStart, $lte: dayEnd },
    });
    if (sessionsToday.length >= 2) {
      const err = new Error('daily_session_limit_exceeded');
      err.status = 400;
      throw err;
    }

    // Enforce time windows: 9AM-1PM or 2PM-6PM
    const hour = now.getHours();
    const inMorning = hour >= 9 && hour < 13; // 9:00 - 12:59
    const inAfternoon = hour >= 14 && hour < 18; // 14:00 - 17:59
    if (!inMorning && !inAfternoon) {
      const err = new Error('outside_allowed_window');
      err.status = 400;
      throw err;
    }

    // Prevent creating multiple sessions within same window
    const windowTag = inMorning ? 'morning' : 'afternoon';
    const hasWindowSession = sessionsToday.some(s => {
      const h = new Date(s.createdAt).getHours();
      const m = h >= 9 && h < 13;
      const a = h >= 14 && h < 18;
      return (windowTag === 'morning' && m) || (windowTag === 'afternoon' && a);
    });
    if (hasWindowSession) {
      const err = new Error('window_already_used');
      err.status = 400;
      throw err;
    }

    const sessionId = 'sess_' + Date.now();
    // qrSeed is a cryptographically strong random value used to derive per-second rotating tokens
    const qrSeed = crypto.randomBytes(32).toString('hex');
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
    if (new Date(sess.expiresAt).getTime() < Date.now()) throw new Error('session expired');

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

      // Upsert emulation for Firestore
      const filter = { sessionId: sess.sessionId, studentUid };
      const existing = await Attendance.findOne(filter);
      let result;
      if (!existing) {
        result = await Attendance.create({
          sessionId: sess.sessionId,
          studentUid,
          timestamp: new Date(),
          verified: true,
          method: 'biometric',
        });
      } else {
        await Attendance.updateOne(filter, { $set: { timestamp: new Date(), verified: true, method: 'biometric' } });
        result = await Attendance.findOne(filter);
      }
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

    const filter = { sessionId: sess.sessionId, studentUid };
    let result;
    const existingQr = await Attendance.findOne(filter);
    if (!existingQr) {
      result = await Attendance.create({
        sessionId: sess.sessionId,
        studentUid,
        timestamp: new Date(),
        verified: false,
        method: 'qr',
      });
    } else {
      await Attendance.updateOne(filter, { $set: { timestamp: new Date(), verified: false, method: 'qr' } });
      result = await Attendance.findOne(filter);
    }
    return { ok: true, verified: result.verified, attendance: { sessionId: result.sessionId, studentUid: result.studentUid, timestamp: result.timestamp, method: result.method, verified: result.verified } };
  }

  static async getProfessorSessions(authorization) {
    const decoded = authzProfessor(authorization);
    
    // Get all sessions created by this professor
    let sessions = await Session.find({ professorUid: decoded.uid });
    sessions = (sessions || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 50);
    
    // For each session, get attendance statistics
    const sessionsWithStats = await Promise.all(
      sessions.map(async (session) => {
        // Count total attendance records for this session
        const totalAttendanceList = await Attendance.find({ sessionId: session.sessionId });
        const totalAttendance = (totalAttendanceList || []).length;
        
        // Count verified attendance (students who actually attended)
        const attendedList = await Attendance.find({ sessionId: session.sessionId, verified: true });
        const attendedStudents = (attendedList || []).length;
        
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
    let attendanceRecords = await Attendance.find({ sessionId });
    attendanceRecords = (attendanceRecords || []).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    
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
    let list = await Attendance.find({ sessionId });
    list = (list || []).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)).slice(0, 1000);
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
    const windowSec = parseInt(process.env.ROTATING_TOKEN_WINDOW_SECONDS || '10', 10);
    // Allow clock skew/window +/- windowSec seconds
    for (let s = nowSec - windowSec; s <= nowSec + windowSec; s++) {
      if (SessionsService.deriveRotatingToken(qrSeed, sessionId, s) === candidate) return true;
    }
    return false;
  }
}

module.exports = SessionsService;