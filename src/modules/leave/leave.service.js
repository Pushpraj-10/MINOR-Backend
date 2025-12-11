const Leave = require('../../models/leave');

class LeaveService {
	static _normalizeDate(dateStr) {
		const d = new Date(dateStr);
		if (Number.isNaN(d.getTime())) throw new Error('invalid_date');
		return d;
	}

	static _startOfDay(date) {
		const d = new Date(date);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	static _endOfDay(date) {
		const d = new Date(date);
		d.setHours(23, 59, 59, 999);
		return d;
	}

	static async requestLeave(userId, startDate, endDate, reason) {
		if (!userId) throw new Error('user_required');
		if (!reason || !reason.trim()) throw new Error('reason_required');

		const start = this._startOfDay(this._normalizeDate(startDate));
		const end = this._endOfDay(this._normalizeDate(endDate));

		if (end < start) throw new Error('end_before_start');

		const maxDays = 30;
		const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
		if (days > maxDays) throw new Error('range_too_long');

		const overlapping = await Leave.findOne({
			userId,
			startDate: { $lte: end },
			endDate: { $gte: start },
		});
		if (overlapping) throw new Error('overlapping_leave');

		const doc = await Leave.create({
			userId,
			startDate: start,
			endDate: end,
			reason: reason.trim(),
			status: 'pending',
		});
		return doc;
	}

	static async listMyLeaves(userId) {
		if (!userId) throw new Error('user_required');
		const leavesRaw = await Leave.find({ userId });
		const leaves = (leavesRaw || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
		return leaves;
	}

	static async listAllLeaves({ status } = {}) {
		const query = {};
		if (status && status !== 'all') {
			query.status = status;
		}
		const leavesRaw = await Leave.find(query);
		const leaves = (leavesRaw || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
		return leaves;
	}

	static async reviewLeave(leaveId, status, reviewerId, note) {
		if (!leaveId) throw new Error('leaveId required');
		if (!['approved', 'rejected'].includes(status)) throw new Error('invalid_status');
		const leave = await Leave.findOne({ id: leaveId });
		if (!leave) throw new Error('leave_not_found');
		await Leave.updateOne({ id: leaveId }, { $set: {
			status,
			reviewedBy: reviewerId || null,
			reviewNote: note || null,
		} });
		const updated = await Leave.findOne({ id: leaveId });
		return updated;
	}

	static async hasActiveApprovedLeave(userId, onDate = new Date()) {
		if (!userId) throw new Error('user_required');
		const dayStart = this._startOfDay(onDate);
		const dayEnd = this._endOfDay(onDate);
		const doc = await Leave.findOne({
			userId,
			status: 'approved',
			startDate: { $lte: dayEnd },
			endDate: { $gte: dayStart },
		});
		return !!doc;
	}
}

module.exports = LeaveService;
