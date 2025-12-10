const express = require('express');
const rateLimit = require('express-rate-limit');

// Sub-routers
const authRouter = require('./modules/auth/auth.router');
const sessionsRouter = require('./modules/sessions/sessions.router');
const biometricsRouter = require('./modules/biometrics/biometrics.router');
const attendanceRouter = require('./modules/attendance/attendance.router');
const adminRouter = require('./modules/admin/admin.router');
const leaveRouter = require('./modules/leave/leave.router');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

// Auth
router.use('/auth', authLimiter, authRouter);

// Sessions
router.use('/sessions', sessionsRouter);

// Biometrics (key mgmt, approval, challenge, validation)
router.use('/biometrics', biometricsRouter);

// Attendance (verifyChallenge + markPresent only)
router.use('/attendance', attendanceRouter);

// Admin-only routes
router.use('/admin', adminRouter);

// Leave requests
router.use('/leave', leaveRouter);

module.exports = router;
