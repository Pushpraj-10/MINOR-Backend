const express = require('express');
const controller = require('./controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

router.post('/', controller.createSession);
router.post('/checkin', rateLimit({ windowMs: 60 * 1000, max: 60 }),  controller.checkin);
router.get('/professor', controller.getProfessorSessions);
router.get('/professor/:sessionId/attendance', controller.getSessionAttendance);
router.get('/:sessionId/attendance', controller.getAttendance);

module.exports = router;


