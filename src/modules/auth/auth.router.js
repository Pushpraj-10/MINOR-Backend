const express = require('express');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/refresh', controller.refreshToken);
router.post('/logout', controller.logout);
router.get('/me', controller.getProfile);
router.get('/users', controller.getUsers);

module.exports = router;


