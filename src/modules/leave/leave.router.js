const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./leave.controller');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.post('/request', limiter, controller.requestLeave);
router.get('/my', limiter, controller.listMyLeaves);
router.get('/all', limiter, controller.listAllLeaves);
router.post('/:leaveId/decision', limiter, controller.reviewLeave);
router.get('/active', limiter, controller.activeLeaveStatus);

module.exports = router;
