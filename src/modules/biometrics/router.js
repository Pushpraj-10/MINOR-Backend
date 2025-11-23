const express = require('express');
const controller = require('./controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const strictLimiter = rateLimit({ windowMs: 60 * 1000, max: 8 });

router.post('/request-enable', generalLimiter, controller.requestEnable);
router.get('/status', generalLimiter, controller.status);
router.post('/register-key', generalLimiter, controller.registerKey);
router.get('/challenge', strictLimiter, controller.getChallenge);
router.post('/validate', strictLimiter, controller.validate);
router.post('/revoke', generalLimiter, controller.revoke);

// Admin endpoints (mounted under /api/biometrics/admin/...)
router.post('/admin/approve', generalLimiter, controller.adminApprove);
router.post('/admin/revoke', generalLimiter, controller.adminRevoke);

module.exports = router;
