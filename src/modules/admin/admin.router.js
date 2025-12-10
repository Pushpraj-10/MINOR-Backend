const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./admin.controller');
const multer = require('multer');

const router = express.Router();
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
const upload = multer({ dest: 'uploads/' });

router.get('/users', adminLimiter, controller.listUsers);
router.patch('/users/:uid/role', adminLimiter, controller.updateUserRole);
router.post('/users/bulk/preview', adminLimiter, upload.single('file'), controller.bulkPreviewUsers);
router.post('/users/bulk/import', adminLimiter, controller.bulkImportUsers);

router.get('/biometrics/requests', adminLimiter, controller.listBiometricRequests);
router.post('/biometrics/requests/:userId/approve', adminLimiter, controller.approveBiometricRequest);

module.exports = router;