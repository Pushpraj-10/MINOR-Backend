const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Session = require('../../models/session');
const Attendance = require('../../models/attendance');
const User = require('../../models/user');
const BiometricsService = require('../../modules/biometrics/service');


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
    let { qrToken, studentUid, embedding, sessionId, method: authMethod, challenge, signature } = body || {};
    console.log(`sessions.checkin: qrToken=${qrToken?.slice?.(0,64) || ''} sessionId=${sessionId || ''} studentUid=${studentUid || ''} method=${authMethod || ''} challengeLen=${(challenge||'').length} signatureLen=${(signature||'').length}`);

    // Accept composite qrToken values produced by the client in the form "<sessionId>:<token>"
    // If client sent a composite token and didn't provide sessionId separately, split it.
    if ((!sessionId || sessionId === '') && typeof qrToken === 'string' && qrToken.includes(':')) {
      const parts = qrToken.split(':');
      if (parts.length >= 2 && parts[0].startsWith('sess_')) {
        sessionId = parts[0];
        // The rest after first colon is the actual rotating token
        qrToken = parts.slice(1).join(':');
        console.log(`sessions.checkin: parsed composite token -> sessionId=${sessionId} qrToken=${qrToken?.slice?.(0,32) || ''}`);
      }
    }
    // Biometric path
    if (authMethod === 'biometric') {
      if (!studentUid) throw new Error('studentUid required');
      // Allow session lookup by sessionId OR fallback to qrToken (more flexible QR formats)
      let sess = null;
      if (sessionId) {
        sess = await Session.findOne({ sessionId });
      }
      if (!sess && qrToken) {
        sess = await Session.findOne({ qrToken });
      }
      if (!sess) throw new Error('session not found');
      if (sess.expiresAt.getTime() < Date.now()) throw new Error('session expired');

      // If session uses rotating tokens, require a valid rotating qrToken
      if (sess.qrSeed) {
        if (!qrToken) throw new Error('qrToken required');
          // For debugging: log expected rotating tokens for current window
          try {
            const nowSec = Math.floor(Date.now() / 1000);
            const expect = [];
            for (let s = nowSec - 1; s <= nowSec + 1; s++) {
              expect.push(SessionsService.deriveRotatingToken(sess.qrSeed, sess.sessionId, s));
            }
            console.log(`sessions.checkin: rotating token validation: candidate=${qrToken} expected=${JSON.stringify(expect)}`);
          } catch (e) {
            console.warn('sessions.checkin: error computing expected tokens', e.message);
          }
          const valid = SessionsService.isRotatingTokenValid(qrToken, sess.qrSeed, sess.sessionId);
          if (!valid) throw new Error('invalid qr');
      } else {
        // If legacy static qrToken exists, optionally ensure it matches when provided
        if (sess.qrToken && qrToken && sess.qrToken !== qrToken) throw new Error('invalid qr');
      }

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
    // Legacy / QR path
    if (!qrToken) throw new Error('qrToken required');
    if (!studentUid) throw new Error('studentUid required');
    // Accept either direct lookup (legacy) or derived rotating token validation
    let sess = null;
    if (sessionId) {
      sess = await Session.findOne({ sessionId });
    }
    if (!sess) {
      // fallback legacy static token flow
      sess = await Session.findOne({ qrToken });
    }
    if (!sess) throw new Error('session not found');
    if (sess.expiresAt.getTime() < Date.now()) throw new Error('session expired');

    // Validate rotating token if qrSeed exists
    if (sess.qrSeed) {
      const valid = this.isRotatingTokenValid(qrToken, sess.qrSeed, sess.sessionId);
      if (!valid) throw new Error('invalid qr');
    }

    // NOTE: Server-side face embedding verification disabled.
    const user = await User.findOne({ uid: studentUid });
    if (!user) throw new Error('user not found');
    let verified = false;
    let method = 'none';
    console.log('Face embedding verification disabled; skipping server-side matching.');

    const update = {
      $setOnInsert: { sessionId: sess.sessionId, studentUid },
      $set: { timestamp: new Date(), verified, method },
    };

    const result = await Attendance.findOneAndUpdate(
      { sessionId: sess.sessionId, studentUid },
      update,
      { new: true, upsert: true }
    );
    console.log(`Attendance saved: sessionId=${result.sessionId}, studentUid=${result.studentUid}, verified=${result.verified}, method=${result.method}`);
    return { ok: true, verified, attendance: { sessionId: result.sessionId, studentUid: result.studentUid, timestamp: result.timestamp, method: result.method, verified: result.verified } };
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

function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

module.exports = SessionsService;