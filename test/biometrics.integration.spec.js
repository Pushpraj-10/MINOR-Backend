const { expect } = require('chai');
const request = require('supertest');
const crypto = require('crypto');

const { app } = require('../src/app');
const Challenge = require('../src/models/challenge');
const Session = require('../src/models/session');
const Attendance = require('../src/models/attendance');
const AttendanceService = require('../src/modules/attendance/attendance.service');

async function registerAndLogin({ email, password, role, name }) {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password, role, name })
    .expect(201);

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  const token = loginRes.body.accessToken;
  const uid = loginRes.body.user.uid;
  expect(token).to.be.a('string');
  expect(uid).to.be.a('string');
  return { token, uid };
}

function signChallenge(privateKeyPem, challengeB64) {
  const sign = crypto.createSign('SHA256');
  sign.update(Buffer.from(challengeB64, 'base64'));
  sign.end();
  return sign.sign(privateKeyPem).toString('base64');
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

async function setupApprovedStudent() {
  const suffix = Date.now() + Math.floor(Math.random() * 1000);
  const admin = await registerAndLogin({
    email: `admin${suffix}@example.com`,
    password: 'StrongPass123!',
    role: 'admin',
    name: 'Admin Test',
  });
  const professor = await registerAndLogin({
    email: `prof${suffix}@example.com`,
    password: 'StrongPass123!',
    role: 'professor',
    name: 'Professor Test',
  });

  const student = await registerAndLogin({
    email: `student${suffix}@example.com`,
    password: 'StrongPass123!',
    role: 'student',
    name: 'Student Test',
  });

  const { publicKeyPem, privateKeyPem } = generateKeyPair();

  await request(app)
    .post('/api/biometrics/register-key')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ publicKeyPem })
    .expect(200);

  await request(app)
    .post('/api/biometrics/admin/approve')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ userId: student.uid })
    .expect(200);

  return { professor, student, keyPair: { publicKeyPem, privateKeyPem } };
}

async function fetchChallenge(token) {
  const res = await request(app)
    .get('/api/biometrics/challenge')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  expect(res.body.challenge).to.be.a('string');
  return res.body.challenge;
}

describe('Biometric challenge integration', function () {
  this.timeout(20000);

  it('registers a key, persists a challenge, and validates signature end-to-end', async function () {
    const { student, keyPair } = await setupApprovedStudent();

    const challenge = await fetchChallenge(student.token);
    const signature = signChallenge(keyPair.privateKeyPem, challenge);

    const validateRes = await request(app)
      .post('/api/biometrics/validate')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ challenge, signature })
      .expect(200);

    expect(validateRes.body).to.include({ ok: true });

    const storedChallenge = await Challenge.findOne({ userId: student.uid });
    expect(storedChallenge).to.exist;
    expect(storedChallenge.used).to.equal(true);
  });

  it('rejects a reused challenge with challenge_mismatch', async function () {
    const { student, keyPair } = await setupApprovedStudent();

    const challenge = await fetchChallenge(student.token);
    const signature = signChallenge(keyPair.privateKeyPem, challenge);

    await request(app)
      .post('/api/biometrics/validate')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ challenge, signature })
      .expect(200);

    const mismatch = await request(app)
      .post('/api/biometrics/validate')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ challenge, signature })
      .expect(400);

    expect(mismatch.body.error).to.equal('challenge_mismatch');
  });

  it('returns invalid_signature when the signature is tampered', async function () {
    const { student, keyPair } = await setupApprovedStudent();

    const challenge = await fetchChallenge(student.token);
    const validSignature = signChallenge(keyPair.privateKeyPem, challenge);
    const sigBuffer = Buffer.from(validSignature, 'base64');
    sigBuffer[0] = sigBuffer[0] ^ 0xff;
    const tampered = sigBuffer.toString('base64');

    const res = await request(app)
      .post('/api/biometrics/validate')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ challenge, signature: tampered })
      .expect(400);

    expect(res.body.error).to.equal('invalid_signature');
  });

  it('marks attendance via verify-challenge when qr token is valid', async function () {
    const { professor, student, keyPair } = await setupApprovedStudent();

    const sessionId = `sess_${Date.now()}`;
    const qrSeed = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await Session.create({
      sessionId,
      professorUid: professor.uid,
      title: 'Integration Session',
      qrSeed,
      createdAt: new Date(),
      expiresAt,
    });

    const nowSec = Math.floor(Date.now() / 1000);
    const qrToken = AttendanceService.deriveRotatingToken(qrSeed, sessionId, nowSec);

    const challenge = await fetchChallenge(student.token);
    const signature = signChallenge(keyPair.privateKeyPem, challenge);

    const verifyRes = await request(app)
      .post('/api/attendance/verify-challenge')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ challenge, signature, qrToken, sessionId })
      .expect(200);

    expect(verifyRes.body.verified).to.equal(true);
    expect(verifyRes.body.attendance).to.include({
      sessionId,
      studentUid: student.uid,
      method: 'biometric',
      verified: true,
    });

    const attendanceDoc = await Attendance.findOne({ sessionId, studentUid: student.uid });
    expect(attendanceDoc).to.exist;
    expect(attendanceDoc.method).to.equal('biometric');
    expect(attendanceDoc.verified).to.equal(true);
  });
});
