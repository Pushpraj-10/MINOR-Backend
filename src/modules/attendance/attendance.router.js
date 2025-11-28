const express = require('express');
const controller = require('./attendance.controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

// Key registration and key-check routes live under `/api/biometrics/*` to
// avoid duplicate endpoints across modules. Keep attendance routes focused
// on verification and marking presence.
router.post('/verify-challenge', generalLimiter, controller.verifyChallenge);
router.post('/mark-present', generalLimiter, controller.markPresent);

module.exports = router;
