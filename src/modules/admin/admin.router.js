const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./admin.controller');

const router = express.Router();
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

router.get('/users', adminLimiter, controller.listUsers);
router.patch('/users/:uid/role', adminLimiter, controller.updateUserRole);

router.get('/biometrics/requests', adminLimiter, controller.listBiometricRequests);
router.post('/biometrics/requests/:userId/approve', adminLimiter, controller.approveBiometricRequest);

module.exports = router;