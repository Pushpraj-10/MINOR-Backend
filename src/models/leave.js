const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
	userId: { type: String, required: true, index: true }, // user uid
	startDate: { type: Date, required: true },
	endDate: { type: Date, required: true },
	reason: { type: String, required: true, trim: true },
	status: {
		type: String,
		enum: ['pending', 'approved', 'rejected'],
		default: 'pending',
	},
	reviewedBy: { type: String, default: null },
	reviewNote: { type: String, default: null },
}, {
	timestamps: true,
});

module.exports = mongoose.model('Leave', LeaveSchema);