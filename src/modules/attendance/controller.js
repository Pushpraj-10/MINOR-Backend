const Service = require('./service');
const AuthService = require('../auth/service');
const SessionsService = require('../sessions/service');

exports.checkKey = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const data = await Service.checkKey(profile.user.uid);
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

    try {
      const result = await Service.verifyChallenge(profile.user.uid, challenge, signature);
      if (result && result.biometricChanged === true) return res.json({ biometricChanged: true });
      if (result && result.verified === true) return res.json({ verified: true });
      return res.status(400).json({ verified: false, reason: result && result.reason });
    } catch (vErr) {
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
