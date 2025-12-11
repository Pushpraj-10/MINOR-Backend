const service = require('./auth.service');

exports.register = async function (req, res) {
  try {
    const result = await service.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.login = async function (req, res) {
  try {
    const { accessToken, refreshToken, user } = await service.login(req.body);
    // httpOnly secure cookie for refresh token in prototype
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ accessToken, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.loginWithGoogle = async function (req, res) {
  try {
    const idToken = req.body?.idToken;
    const { accessToken, refreshToken, user } = await service.loginWithGoogle(idToken);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ accessToken, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.refreshToken = async function (req, res) {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    const result = await service.refreshToken(refreshToken);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};

exports.logout = async function (req, res) {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    await service.logout(refreshToken);
    res.clearCookie('refresh_token');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getProfile = async function (req, res) {
  try {
    const result = await service.getProfile(req.headers.authorization);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};

exports.getUsers = async function (req, res) {
  try {
    const result = await service.getUsers();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};