const User = require('../../models/user');
const BiometricKey = require('../../models/biometricKey');
const BiometricsService = require('../biometrics/biometrics.service');
const AuthService = require('../auth/auth.service');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Attendance = require('../../models/attendance');

const ALLOWED_ROLES = AuthService.ALLOWED_ROLES || ['student', 'professor', 'admin'];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const UPLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutes

const uploadStore = new Map();

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

  // -----------------------------
  // BULK IMPORT (CSV with mapping)
  // -----------------------------
  static _storeUpload(filePath) {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    uploadStore.set(id, { filePath, expires: Date.now() + UPLOAD_TTL_MS });
    return id;
  }

  static _consumeUpload(uploadId) {
    const entry = uploadStore.get(uploadId);
    if (!entry) throw new Error('upload_not_found');
    if (entry.expires < Date.now()) {
      uploadStore.delete(uploadId);
      try { fs.unlinkSync(entry.filePath); } catch (_) {}
      throw new Error('upload_expired');
    }
    uploadStore.delete(uploadId);
    return entry.filePath;
  }

  static async previewCsvUpload(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      const records = parse(content, { columns: true, skip_empty_lines: true });
      if (!records.length) throw new Error('empty_csv');

      const headers = Object.keys(records[0]);
      const sample = records.slice(0, 10);
      const uploadId = this._storeUpload(filePath);

      return { uploadId, headers, sampleRows: sample };
    } catch (err) {
      try { fs.unlinkSync(filePath); } catch (_) {}
      throw err;
    }
  }

  static async approveBiometric(userId) {
    if (!userId) throw new Error('userId required');
    await BiometricsService.adminApprove(userId);
    return { ok: true };
  }

  static async importCsvUpload(uploadId, mapping) {
    const filePath = this._consumeUpload(uploadId);

    const content = fs.readFileSync(filePath);
    const records = parse(content, { columns: true, skip_empty_lines: true });

    const requiredFields = ['email', 'uid', 'password'];
    for (const f of requiredFields) {
      if (!mapping[f]) throw new Error(`mapping_missing_${f}`);
    }

    let successCount = 0;
    const errors = [];

    for (const row of records) {
      try {
        const email = row[mapping.email];
        const uid = row[mapping.uid];
        const password = row[mapping.password];
        const name = mapping.name ? row[mapping.name] : undefined;
        const batch = mapping.batch ? row[mapping.batch] : undefined;
        const role = this.normalizeRole(mapping.role ? row[mapping.role] : null) || 'student';

        if (!email || !uid || !password) {
          throw new Error('missing_required_fields');
        }

        const dup = await User.findOne({ $or: [{ email }, { uid }] });
        if (dup) throw new Error('duplicate_user');

        const passwordHash = await bcrypt.hash(password, 10);

        await User.create({
          uid,
          email,
          name: name || undefined,
          passwordHash,
          role,
          batch: batch || null,
          createdAt: new Date(),
        });

        successCount += 1;
      } catch (err) {
        errors.push({ row: row, error: err.message });
      }
    }

    try { fs.unlinkSync(filePath); } catch (_) {}

    return {
      uploadId,
      successCount,
      failureCount: errors.length,
      errors,
    };
  }

  // -----------------------------
  // Monthly Attendance CSV
  // -----------------------------
  static _monthRange(monthStr) {
    // monthStr: YYYY-MM
    const [y, m] = monthStr.split('-').map((s) => parseInt(s, 10));
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // exclusive
    return { start, end };
  }

  static async _listStudents(batch) {
    const query = { role: 'student' };
    if (batch) query.batch = batch;
    const users = await User.find(query)
      .select('uid name batch')
      .lean();
    return users;
  }

  static _distinctDayCount(docs) {
    const set = new Set();
    for (const d of docs) {
      const ts = d.timestamp instanceof Date ? d.timestamp : new Date(d.timestamp);
      const key = ts.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
      set.add(key);
    }
    return set.size;
  }

  static _daysInMonth(monthStr) {
    const [y, m] = monthStr.split('-').map((s) => parseInt(s, 10));
    return new Date(y, m, 0).getDate();
  }

  static async buildMonthlyAttendanceCsv({ month, batch }) {
    const { start, end } = this._monthRange(month);
    const students = await this._listStudents(batch);

    const header = 'student_name,days_present,days_absent\n';
    const rows = [];
    const totalDays = this._daysInMonth(month);

    for (const s of students) {
      const attendanceDocs = await Attendance.find({
        studentUid: s.uid,
        timestamp: { $gte: start, $lt: end },
        verified: true,
      }).select('timestamp').lean();

      const presentDays = this._distinctDayCount(attendanceDocs);
      const absentDays = Math.max(totalDays - presentDays, 0);
      const safeName = (s.name || 'Unknown').replace(/"/g, '""');
      rows.push(`${safeName},${presentDays},${absentDays}`);
    }

    return header + rows.join('\n');
  }
}

module.exports = AdminService;