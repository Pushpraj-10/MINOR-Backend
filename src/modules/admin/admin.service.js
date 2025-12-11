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
      const term = search.trim().toLowerCase();
      // Firestore: fetch and filter client-side for search
    }

    let usersAll = await User.find(query);
    // sanitize and search filter
    usersAll = (usersAll || []).map(u => {
      const copy = { ...u };
      delete copy.passwordHash;
      return copy;
    });
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      usersAll = usersAll.filter(u => (
        (u.email || '').toLowerCase().includes(term) ||
        (u.name || '').toLowerCase().includes(term) ||
        (u.uid || '').toLowerCase().includes(term)
      ));
    }
    // sort by createdAt desc, fallback stable
    usersAll.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const total = usersAll.length;
    const start = (safePage - 1) * safeSize;
    const users = usersAll.slice(start, start + safeSize);

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
      const admins = await User.find({ role: 'admin' });
      const adminCount = (admins || []).length;
      if (adminCount <= 1) {
        throw new Error('last_admin');
      }
    }

    await User.updateOne({ uid: targetUid }, { $set: { role: normalizedRole, updatedAt: new Date() } });
    const updated = await User.findOne({ uid: targetUid });
    if (updated) delete updated.passwordHash;
    return updated;
  }

  static async listBiometricRequests({ status, search, page, pageSize }) {
    const { page: safePage, pageSize: safeSize } = normalizePagination(page, pageSize);
    const match = {};
    if (status && status !== 'all') {
      match.status = status;
    }

    let orFilters = null;
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      // Firestore cannot do regex; we will filter client-side
    }

    let docsAll = await BiometricKey.find(match);
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      docsAll = docsAll.filter(d => (
        (d.userId || '').toLowerCase().includes(term) ||
        (d.publicKeyHash || '').toLowerCase().includes(term) ||
        (d.pendingPublicKeyHash || '').toLowerCase().includes(term)
      ));
    }
    docsAll.sort((a, b) => {
      const aTime = new Date(a.pendingCreatedAt || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.pendingCreatedAt || b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    const total = docsAll.length;
    const start = (safePage - 1) * safeSize;
    const docs = docsAll.slice(start, start + safeSize);

    const userIds = docs.map((doc) => doc.userId);
    const relatedUsers = await User.find({ uid: { $in: userIds } });
    const userMap = new Map((relatedUsers || []).map((u) => {
      const copy = { ...u };
      delete copy.passwordHash;
      return [u.uid, copy];
    }));

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

        // Firestore doesn't support $or directly; check separately
        const dupByUid = await User.findOne({ uid });
        const dupByEmail = await User.findOne({ email });
        if (dupByUid || dupByEmail) throw new Error('duplicate_user');

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
    let users = await User.find(query);
    users = (users || []).map(u => ({ uid: u.uid, name: u.name, batch: u.batch }));
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
      });

      const presentDays = this._distinctDayCount(attendanceDocs);
      const absentDays = Math.max(totalDays - presentDays, 0);
      const safeName = (s.name || 'Unknown').replace(/"/g, '""');
      rows.push(`${safeName},${presentDays},${absentDays}`);
    }

    return header + rows.join('\n');
  }
}

module.exports = AdminService;