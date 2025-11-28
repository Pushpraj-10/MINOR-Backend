const Service = require('./attendance.service');
const AuthService = require('../auth/auth.service');
const SessionsService = require('../sessions/sessions.service');

// NOTE: `checkKey` and `registerKey` handlers were intentionally removed
// from the attendance controller to avoid duplicating key-management
// endpoints. Key registration and key-checking live under the
// `/api/biometrics/*` handlers (see `src/modules/biometrics`).
// The verification and attendance-marking routes remain here.

exports.verifyChallenge = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const { challenge, signature, qrToken, sessionId, studentUid } = req.body || {};
    
    if (!challenge || !signature) {
      throw new Error('challenge and signature required');
    }

    console.log(`attendance.controller.verifyChallenge: user=${profile.user.uid} hasQrToken=${!!qrToken} hasSessionId=${!!sessionId}`);

    // Verify the biometric signature
    const result = await Service.verifyChallenge(profile.user.uid, challenge, signature);
    
    console.log(`attendance.controller.verifyChallenge: user=${profile.user.uid} verified=${result.verified} biometricChanged=${!!result.biometricChanged}`);

    // If biometric changed (key revoked), return immediately
    if (result.biometricChanged === true) {
      return res.json({ biometricChanged: true });
    }

    // If verification failed, return the reason
    if (!result.verified) {
      return res.json({ verified: false, reason: result.reason || 'verification_failed' });
    }

    // Verification succeeded - now handle attendance marking if session info provided
    if (qrToken || sessionId) {
      try {
        const checkinBody = {
          qrToken,
          sessionId,
          studentUid: studentUid || profile.user.uid,
          method: 'biometric',
          // Include challenge/signature for audit trail
          challenge,
          signature
        };
        
        console.log(`attendance.controller.verifyChallenge: user=${profile.user.uid} marking attendance`);
        const attendanceResult = await SessionsService.checkin(checkinBody);
        
        return res.json({ 
          verified: true, 
          attendance: attendanceResult.attendance 
        });
      } catch (attErr) {
        console.error(`attendance.controller.verifyChallenge: user=${profile.user.uid} attendance marking failed: ${attErr.message}`);
        
        // Return verification success but with attendance error
        return res.json({ 
          verified: true, 
          attendanceError: attErr.message 
        });
      }
    }

    // No session info provided - just return verification success
    return res.json({ verified: true });
    
  } catch (err) {
    console.error(`attendance.controller.verifyChallenge: error=${err.message}`);
    res.status(400).json({ error: err.message });
  }
};

exports.markPresent = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    // Allow SessionsService.checkin to handle marking attendance
    const body = req.body || {};
    // Ensure studentUid defaults to profile uid if not provided
    if (!body.studentUid) body.studentUid = profile.user.uid;
    const result = await SessionsService.checkin(body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
