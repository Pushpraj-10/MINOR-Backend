const service = require('./service');

exports.createSession = async function (req, res) {
  try {
    const result = await service.createSession(req.body, req.headers.authorization);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.checkin = async function (req, res) {
  try {
    console.log('sessions.checkin: body=', JSON.stringify(req.body || {}));
    const result = await service.checkin(req.body);
    res.json(result);
  } catch (err) {
    console.error('sessions.checkin.error:', err.message);
    console.error(err.stack);
    res.status(400).json({ error: err.message });
  }
};

exports.getProfessorSessions = async function (req, res) {
  try {
    const result = await service.getProfessorSessions(req.headers.authorization);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getSessionAttendance = async function (req, res) {
  try {
    const result = await service.getSessionAttendance(req.params.sessionId, req.headers.authorization);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAttendance = async function (req, res) {
  try {
    const result = await service.getAttendanceRaw(req.params.sessionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};