const express = require('express');
const controller = require('./biometrics.controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const strictLimiter = rateLimit({ windowMs: 60 * 1000, max: 8 });

router.post('/request-enable', generalLimiter, controller.requestEnable);
router.get('/status', generalLimiter, controller.status);

router.get('/exists', generalLimiter, controller.exists);
router.get('/approval', generalLimiter, controller.approval);
router.get('/public-key', generalLimiter, controller.getPublicKey);

router.post('/register-key', generalLimiter, controller.registerKey);
router.get('/challenge', strictLimiter, controller.getChallenge);
router.get('/check', strictLimiter, controller.checkKeyAndChallenge);
router.post('/check-key', strictLimiter, controller.checkKey);
router.post('/validate', strictLimiter, controller.validate);

router.post('/revoke', generalLimiter, controller.revoke);
router.delete('/delete-key', generalLimiter, controller.deleteKey);

router.post('/admin/approve', generalLimiter, controller.adminApprove);
router.post('/admin/revoke', generalLimiter, controller.adminRevoke);

module.exports = router;
