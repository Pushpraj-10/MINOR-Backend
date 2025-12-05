const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { customAlphabet } = require('nanoid');
const User = require('../../models/user');
const RefreshToken = require('../../models/refreshToken');

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 12);
const ALLOWED_ROLES = ['student', 'professor', 'admin'];

function signAccess(payload) {
  const secret = process.env.JWT_SECRET || 'defaultsecret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  return jwt.sign(payload, secret, { expiresIn });
}

function signRefresh(payload) {
  const secret = process.env.JWT_REFRESH_SECRET || 'refreshsecret';
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn });
}

async function verifyRefresh(refreshToken) {
  const secret = process.env.JWT_REFRESH_SECRET || 'refreshsecret';
  return jwt.verify(refreshToken, secret);
}

class AuthService {
  static async register(body) {
    const { email, password, name } = body;
    let role = body.role || 'student';
    if (!ALLOWED_ROLES.includes(role)) {
      role = 'student';
    }
    if (!email || !password) throw new Error('email and password are required');
    const existing = await User.findOne({ email });
    if (existing) throw new Error('User already exists');
    const uid = 'user_' + nanoid();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ uid, role, email, name, passwordHash });
    return { uid: user.uid, email: user.email, role: user.role, name: user.name };
  }

  static async login(body) {
    const { email, password } = body;
    if (!email || !password) throw new Error('email and password are required');
    const user = await User.findOne({ email });
    if (!user) throw new Error('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) throw new Error('Invalid credentials');
    const payload = { uid: user.uid, role: user.role };
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);
    const tokenId = 'rt_' + nanoid();
    const refreshExpires = new Date(Date.now() + (parseInt(process.env.JWT_REFRESH_MAX_AGE_MS || '604800000', 10)));
    await RefreshToken.create({ tokenId, uid: user.uid, createdAt: new Date(), expiresAt: refreshExpires });
    return { accessToken, refreshToken, user: { uid: user.uid, email: user.email, role: user.role, name: user.name } };
  }

  static async refreshToken(refreshToken) {
    if (!refreshToken) throw new Error('missing refresh token');
    const decoded = await verifyRefresh(refreshToken);
    // Prototype: ensure the user still exists and token not expired by TTL
    const user = await User.findOne({ uid: decoded.uid });
    if (!user) throw new Error('user not found');
    const payload = { uid: decoded.uid, role: decoded.role };
    const accessToken = signAccess(payload);
    return { accessToken };
  }

  static async logout(refreshToken) {
    // Prototype: best-effort revoke by uid using decoded token
    if (!refreshToken) return { ok: true };
    try {
      const decoded = await verifyRefresh(refreshToken);
      await RefreshToken.deleteMany({ uid: decoded.uid });
    } catch (_) {
      // ignore decode errors on logout
    }
    return { ok: true };
  }

  static async getProfile(authorization) {
    if (!authorization) throw new Error('missing Authorization header');
    const token = authorization.replace('Bearer ', '');
    const secret = process.env.JWT_SECRET || 'defaultsecret';
    const decoded = jwt.verify(token, secret);
    const user = await User.findOne({ uid: decoded.uid }, { passwordHash: 0 });
    if (!user) throw new Error('user not found');
    return { user };
  }

  static async getUsers() {
    const users = await User.find({}, { passwordHash: 0 }).limit(100);
    return { users };
  }
}

AuthService.ALLOWED_ROLES = ALLOWED_ROLES;

module.exports = AuthService;
module.exports.ALLOWED_ROLES = ALLOWED_ROLES;


