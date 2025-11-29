const Service = require('./attendance.service');
const AuthService = require('../auth/auth.service');
const SessionsService = require('../sessions/sessions.service');

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
        const attendanceResult = await SessionsService.checkin({
          qrToken,
          sessionId,
          studentUid: studentUid || profile.user.uid,
          method: 'biometric',
          challenge,
          signature
        });
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
    const result = await SessionsService.checkin(body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
