const express = require('express');
const controller = require('./controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.get('/check-key', generalLimiter, controller.checkKey);
router.post('/register-key', generalLimiter, controller.registerKey);
router.post('/verify-challenge', generalLimiter, controller.verifyChallenge);
router.post('/mark-present', generalLimiter, controller.markPresent);

module.exports = router;
