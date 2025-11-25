const express = require('express');
const rateLimit = require('express-rate-limit');

// Sub-routers
const authRouter = require('./modules/auth/router');
const sessionsRouter = require('./modules/sessions/router');
const biometricsRouter = require('./modules/biometrics/router');
const attendanceRouter = require('./modules/attendance/router');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
router.use('/auth', authLimiter, authRouter);
router.use('/sessions', sessionsRouter);
router.use('/biometrics', biometricsRouter);
router.use('/attendance', attendanceRouter);

module.exports = router;


