const express = require('express');
const controller = require('./attendance.controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.post('/verify-challenge', generalLimiter, controller.verifyChallenge);
router.post('/mark-present', generalLimiter, controller.markPresent);
router.post('/take-leave', generalLimiter, controller.takeLeave);
router.get('/statistics/:userId', generalLimiter, controller.getAttendanceStatistics);

module.exports = router;
