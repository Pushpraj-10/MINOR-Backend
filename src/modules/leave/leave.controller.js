const AuthService = require('../auth/auth.service');
const LeaveService = require('./leave.service');

exports.requestLeave = async function requestLeave(req, res) {
	try {
		const profile = await AuthService.getProfile(req.headers.authorization);
		const { startDate, endDate, reason } = req.body || {};
		const doc = await LeaveService.requestLeave(profile.user.uid, startDate, endDate, reason);
		res.json({ leave: doc });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

exports.listMyLeaves = async function listMyLeaves(req, res) {
	try {
		const profile = await AuthService.getProfile(req.headers.authorization);
		const leaves = await LeaveService.listMyLeaves(profile.user.uid);
		res.json({ leaves });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

exports.listAllLeaves = async function listAllLeaves(req, res) {
	try {
		const profile = await AuthService.getProfile(req.headers.authorization);
		const role = profile?.user?.role;
		if (role !== 'admin' && role !== 'professor') {
			const err = new Error('forbidden');
			err.status = 403;
			throw err;
		}
		const status = req.query?.status;
		const leaves = await LeaveService.listAllLeaves({ status });
		res.json({ leaves });
	} catch (err) {
		res.status(err.status || 400).json({ error: err.message });
	}
};

exports.reviewLeave = async function reviewLeave(req, res) {
	try {
		const profile = await AuthService.getProfile(req.headers.authorization);
		const role = profile?.user?.role;
		if (role !== 'admin' && role !== 'professor') {
			const err = new Error('forbidden');
			err.status = 403;
			throw err;
		}

		const { status, note } = req.body || {};
		const leaveId = req.params.leaveId;
		const updated = await LeaveService.reviewLeave(leaveId, status, profile.user.uid, note);
		res.json({ leave: updated });
	} catch (err) {
		res.status(err.status || 400).json({ error: err.message });
	}
};

exports.activeLeaveStatus = async function activeLeaveStatus(req, res) {
	try {
		const profile = await AuthService.getProfile(req.headers.authorization);
		const userId = (req.query?.userId && req.query.userId !== 'me')
			? req.query.userId
			: profile?.user?.uid;
		const active = await LeaveService.hasActiveApprovedLeave(userId, new Date());
		res.json({ active });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};
