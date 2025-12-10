const Service = require('./attendance.service');
const AuthService = require('../auth/auth.service');

exports.verifyChallenge = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const { challenge, signature, qrToken, sessionId, studentUid } = req.body || {};
    if (!challenge || !signature) throw new Error('challenge and signature required');

    const result = await Service.verifyChallenge(profile.user.uid, challenge, signature);

    if (result.biometricChanged === true) {
      return res.json({ biometricChanged: true });
    }
    if (!result.verified) {
      return res.json({ verified: false, reason: result.reason || 'verification_failed' });
    }

    if (qrToken || sessionId) {
      try {
        const attendanceResult = await Service.recordAttendance({
          qrToken,
          sessionId,
          studentUid: studentUid || profile.user.uid,
          method: 'biometric',
          challenge,
          signature
        }, { skipBiometricValidation: true });
        return res.json({ verified: true, attendance: attendanceResult.attendance });
      } catch (attErr) {
        return res.json({ verified: true, attendanceError: attErr.message });
      }
    }

    return res.json({ verified: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.markPresent = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const body = req.body || {};
    if (!body.studentUid) body.studentUid = profile.user.uid;
    const result = await Service.recordAttendance(body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.takeLeave = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const body = req.body || {};
    if (!body.studentUid) body.studentUid = profile.user.uid;
    const result = await Service.takeLeave(body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAttendanceStatistics = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const userId = (req.params.userId && req.params.userId !== 'me')
      ? req.params.userId
      : profile.user.uid;
    const stats = await Service.getAttendanceStatistics(userId);
    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};