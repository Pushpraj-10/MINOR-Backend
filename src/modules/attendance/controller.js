const Service = require('./service');
const AuthService = require('../auth/service');
const SessionsService = require('../sessions/service');

exports.checkKey = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const data = await Service.checkKey(profile.user.uid);
    try {
      // Log the response we will send back for debugging (preview challenge/publicKey if present)
      const preview = { publicKeyRegistered: !!data.publicKeyRegistered };
      if (data.challenge) preview.challengePreview = (data.challenge || '').slice(0, 120);
      if (data.publicKeyPem) preview.publicKeyPreview = (data.publicKeyPem || '').replace(/\r?\n/g, '\\n').slice(0, 200);
      console.log(`attendance.controller.checkKey: user=${profile.user.uid} responsePreview=${JSON.stringify(preview)}`);
    } catch (logErr) {
      console.warn('attendance.controller.checkKey: failed to log response preview', logErr);
    }
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.registerKey = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const { publicKeyPem } = req.body || {};
    if (!publicKeyPem) throw new Error('publicKeyPem required');
    await Service.registerKey(profile.user.uid, publicKeyPem);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.verifyChallenge = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const { challenge, signature } = req.body || {};
    if (!challenge || !signature) throw new Error('challenge and signature required');

    // Log incoming challenge/signature preview for debugging (do not log full signature)
    try {
      const chalPreview = String(challenge).slice(0, 120);
      const sigPreview = String(signature).slice(0, 80);
      console.log(`attendance.controller.verifyChallenge: user=${profile.user.uid} challengePreview=${chalPreview} signaturePreview=${sigPreview}`);
    } catch (logErr) {
      console.warn('attendance.controller.verifyChallenge: failed to log incoming preview', logErr);
    }

    try {
      const result = await Service.verifyChallenge(profile.user.uid, challenge, signature);
      try {
        const rp = { verified: !!result.verified };
        if (result.biometricChanged) rp.biometricChanged = true;
        if (result.reason) rp.reason = String(result.reason).slice(0, 200);
        console.log(`attendance.controller.verifyChallenge: user=${profile.user.uid} resultPreview=${JSON.stringify(rp)}`);
      } catch (logErr) {
        console.warn('attendance.controller.verifyChallenge: failed to log result preview', logErr);
      }
      if (result && result.biometricChanged === true) return res.json({ biometricChanged: true });
      if (result && result.verified === true) return res.json({ verified: true });
      return res.status(400).json({ verified: false, reason: result && result.reason });
    } catch (vErr) {
      // Ensure any thrown errors are logged with detail
      console.error(`attendance.controller.verifyChallenge: verification threw for user=${profile.user.uid} err=${vErr && vErr.message}`);
      throw vErr;
    }
  } catch (err) {
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
