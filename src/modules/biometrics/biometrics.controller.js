const Service = require('./biometrics.service');
const AuthService = require('../auth/auth.service');
const SessionsService = require('../sessions/sessions.service');

exports.requestEnable = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    await Service.requestEnable(profile.user.uid);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.status = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const status = await Service.getStatus(profile.user.uid);
    console.log(`biometrics.status: user=${profile.user.uid} -> ${status}`);
    res.json({ status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.registerKey = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const { publicKeyPem } = req.body || {};
    if (!publicKeyPem) throw new Error('publicKeyPem required');
    console.log(`biometrics.registerKey: user=${profile.user.uid} pemLength=${(publicKeyPem||'').length}`);
    await Service.registerKey(profile.user.uid, publicKeyPem);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getChallenge = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const challenge = await Service.createChallenge(profile.user.uid);
    res.json({ challenge });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getPublicKey = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const data = await Service.getPublicKey(profile.user.uid);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.exists = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const data = await Service.getPublicKey(profile.user.uid);
    const present = !!(data && (data.publicKeyPem || data.pendingPublicKeyPem || data.publicKeyHash || data.pendingPublicKeyHash));
    res.json({ key_present: present });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.approval = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const status = await Service.getStatus(profile.user.uid);
    res.json({ approved: status === 'approved', status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /biometrics/check → { status, challenge?, publicKeyHash?, pendingPublicKeyHash?, updatedAt? }
exports.checkKeyAndChallenge = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const userId = profile.user.uid;

    const keyData = await Service.getPublicKey(userId);
    const status = keyData.status || 'none';

    const response = {
      status,
      publicKeyHash: keyData.publicKeyHash || null,
      pendingPublicKeyHash: keyData.pendingPublicKeyHash || null,
      updatedAt: keyData.updatedAt || null
    };

    if (status === 'approved' && keyData.publicKeyPem) {
      try {
        const challenge = await Service.createChallenge(userId);
        response.challenge = challenge;
      } catch (challengeErr) {
        console.warn(`biometrics.checkKeyAndChallenge: user=${userId} challenge creation failed: ${challengeErr.message}`);
      }
    }

    res.json(response);
  } catch (err) {
    console.error(`biometrics.checkKeyAndChallenge: error=${err.message}`);
    res.status(400).json({ error: err.message });
  }
};

exports.checkKey = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const { publicKeyPem } = req.body || {};
    if (!publicKeyPem) throw new Error('publicKeyPem required');
    const match = await Service.checkKey(profile.user.uid, publicKeyPem);
    res.json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.validate = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const { challenge, signature } = req.body || {};
    if (!challenge || !signature) throw new Error('challenge and signature required');

    const ok = await Service.validateSignature(profile.user.uid, challenge, signature);

    let attendanceResult = null;
    try {
      const { qrToken, sessionId, studentUid } = req.body || {};
      if (ok && (sessionId || qrToken)) {
        const checkinBody = {
          qrToken,
          sessionId,
          studentUid: studentUid || profile.user.uid,
          challenge,
          signature,
          method: 'biometric'
        };
        attendanceResult = await SessionsService.checkin(checkinBody);
      }
    } catch (err) {
      console.error('biometrics.validate: attendance marking failed', err.message);
      return res.json({ ok, attendanceError: err.message });
    }

    if (attendanceResult) return res.json({ ok, attendance: attendanceResult.attendance });
    return res.json({ ok });
  } catch (err) {
    console.error(`biometrics.validate.error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
};

exports.revoke = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    const reason = req.body?.reason || 'user_requested';
    await Service.revoke(profile.user.uid, reason);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.adminApprove = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    if (profile.user.role !== 'admin') throw new Error('forbidden');
    const { userId } = req.body || {};
    if (!userId) throw new Error('userId required');
    await Service.adminApprove(userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.adminRevoke = async function (req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    if (profile.user.role !== 'admin') throw new Error('forbidden');
    const { userId, reason } = req.body || {};
    if (!userId) throw new Error('userId required');
    await Service.revoke(userId, reason || 'admin_revoked');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteKey = async function(req, res) {
  try {
    const profile = await AuthService.getProfile(req.headers.authorization);
    await require('./biometrics.service').deleteKey(profile.user.uid);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
