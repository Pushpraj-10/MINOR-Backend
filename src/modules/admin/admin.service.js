const User = require('../../models/user');
const BiometricKey = require('../../models/biometricKey');
const BiometricsService = require('../biometrics/biometrics.service');
const AuthService = require('../auth/auth.service');

const ALLOWED_ROLES = AuthService.ALLOWED_ROLES || ['student', 'professor', 'admin'];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function normalizePagination(page, pageSize) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeSize = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  return { page: safePage, pageSize: safeSize };
}

class AdminService {
  static allowedRoles() {
    return ALLOWED_ROLES;
  }

  static normalizeRole(role) {
    if (!role) return null;
    const lowered = String(role).toLowerCase();
    return ALLOWED_ROLES.includes(lowered) ? lowered : null;
  }

  static async listUsers({ role, search, page, pageSize }) {
    const { page: safePage, pageSize: safeSize } = normalizePagination(page, pageSize);
    const query = {};
    if (role && role !== 'all') {
      const normalizedRole = this.normalizeRole(role);
      if (normalizedRole) {
        query.role = normalizedRole;
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { email: regex },
        { name: regex },
        { uid: regex },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeSize)
        .limit(safeSize)
        .lean(),
    ]);

    return {
      users,
      total,
      page: safePage,
      pageSize: safeSize,
    };
  }

  static async updateUserRole(targetUid, nextRole, actingUid) {
    const normalizedRole = this.normalizeRole(nextRole);
    if (!normalizedRole) throw new Error('invalid_role');
    if (!targetUid) throw new Error('missing_user');

    if (actingUid && actingUid === targetUid && normalizedRole !== 'admin') {
      throw new Error('cannot_demote_self');
    }

    const user = await User.findOne({ uid: targetUid });
    if (!user) throw new Error('user_not_found');

    if (user.role === 'admin' && normalizedRole !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        throw new Error('last_admin');
      }
    }

    user.role = normalizedRole;
    user.updatedAt = new Date();
    await user.save();

    const sanitized = user.toObject();
    delete sanitized.passwordHash;
    return sanitized;
  }

  static async listBiometricRequests({ status, search, page, pageSize }) {
    const { page: safePage, pageSize: safeSize } = normalizePagination(page, pageSize);
    const match = {};
    if (status && status !== 'all') {
      match.status = status;
    }

    let orFilters = null;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      orFilters = [{ userId: { $regex: regex } }];
      const matchedUsers = await User.find({
        $or: [
          { email: regex },
          { name: regex },
          { uid: regex },
        ],
      }).select('uid').lean();
      if (matchedUsers.length) {
        const ids = matchedUsers.map((u) => u.uid);
        orFilters.push({ userId: { $in: ids } });
      }
      match.$or = orFilters;
    }

    const [total, docs] = await Promise.all([
      BiometricKey.countDocuments(match),
      BiometricKey.find(match)
        .sort({ pendingCreatedAt: -1, updatedAt: -1, createdAt: -1 })
        .skip((safePage - 1) * safeSize)
        .limit(safeSize)
        .lean(),
    ]);

    const userIds = docs.map((doc) => doc.userId);
    const relatedUsers = await User.find({ uid: { $in: userIds } })
      .select('-passwordHash')
      .lean();
    const userMap = new Map(relatedUsers.map((u) => [u.uid, u]));

    const requests = docs.map((doc) => ({
      userId: doc.userId,
      status: doc.status,
      publicKeyHash: doc.publicKeyHash || null,
      pendingPublicKeyHash: doc.pendingPublicKeyHash || null,
      pendingCreatedAt: doc.pendingCreatedAt || null,
      updatedAt: doc.updatedAt || null,
      createdAt: doc.createdAt || null,
      user: userMap.get(doc.userId) || null,
    }));

    return {
      requests,
      total,
      page: safePage,
      pageSize: safeSize,
    };
  }

  static async approveBiometric(userId) {
    if (!userId) throw new Error('userId required');
    await BiometricsService.adminApprove(userId);
    return { ok: true };
  }
}

module.exports = AdminService;