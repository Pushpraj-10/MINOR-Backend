const AdminService = require('./admin.service');
const AuthService = require('../auth/auth.service');

async function ensureAdmin(req) {
  const profile = await AuthService.getProfile(req.headers.authorization);
  if (!profile?.user || profile.user.role !== 'admin') {
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }
  return profile;
}

function handleError(res, err) {
  const status = err.status || (err.message === 'forbidden' ? 403 : 400);
  res.status(status).json({ error: err.message });
}

exports.listUsers = async function listUsers(req, res) {
  try {
    await ensureAdmin(req);
    const data = await AdminService.listUsers({
      role: req.query.role,
      search: req.query.search || req.query.q,
      page: req.query.page,
      pageSize: req.query.pageSize || req.query.limit,
    });
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
};

exports.updateUserRole = async function updateUserRole(req, res) {
  try {
    const profile = await ensureAdmin(req);
    const updated = await AdminService.updateUserRole(
      req.params.uid,
      req.body?.role,
      profile.user.uid,
    );
    res.json({ user: updated });
  } catch (err) {
    handleError(res, err);
  }
};

exports.listBiometricRequests = async function listBiometricRequests(req, res) {
  try {
    await ensureAdmin(req);
    const data = await AdminService.listBiometricRequests({
      status: req.query.status || 'pending',
      search: req.query.search || req.query.q,
      page: req.query.page,
      pageSize: req.query.pageSize || req.query.limit,
    });
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
};

exports.approveBiometricRequest = async function approveBiometricRequest(req, res) {
  try {
    await ensureAdmin(req);
    const result = await AdminService.approveBiometric(req.params.userId);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
};
