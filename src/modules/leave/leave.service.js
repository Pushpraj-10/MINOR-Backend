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
		}).lean();
		if (overlapping) throw new Error('overlapping_leave');

		const doc = await Leave.create({
			userId,
			startDate: start,
			endDate: end,
			reason: reason.trim(),
			status: 'pending',
		});

		return doc.toObject();
	}

	static async listMyLeaves(userId) {
		if (!userId) throw new Error('user_required');
		const leaves = await Leave.find({ userId }).sort({ createdAt: -1 }).lean();
		return leaves;
	}
}

module.exports = LeaveService;
