const { expect } = require('chai');
const request = require('supertest');
const crypto = require('crypto');

const { startInMemoryMongo, stopInMemoryMongo } = require('./setup');
const db = require('../src/config/db');
const User = require('../src/models/user');
const BiometricKey = require('../src/models/biometricKey');
const Session = require('../src/models/session');
const Attendance = require('../src/models/attendance');

let app;

describe('Replay detection, revoke/re-register, and attendance marking', function () {
  this.timeout(30000);

  before(async () => {
    await startInMemoryMongo();
    await db.connectToDatabase();
    const serverModule = require('../src/app');
    app = serverModule.app;
  });

  after(async () => {
    await stopInMemoryMongo();
  });

  it('detects replay and revokes key on second reuse', async () => {
    const uid = 'user_replay_1';
    await User.create({ uid, email: 'r@test', role: 'student' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ uid, role: 'student' }, process.env.JWT_SECRET || 'testsecret');

    // keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

    const resReg = await request(app)
      .post('/api/attendance/register-key')
      .set('Authorization', 'Bearer ' + token)
      .send({ publicKeyPem: publicPem });
    if (resReg.status !== 200) throw new Error(`register-key failed status=${resReg.status} body=${JSON.stringify(resReg.body)}`);

    // approve
    const keyDoc = await BiometricKey.findOne({ userId: uid });
    keyDoc.status = 'approved';
    await keyDoc.save();

    // get challenge
    const resChk = await request(app)
      .get('/api/attendance/check-key')
      .set('Authorization', 'Bearer ' + token);
    if (resChk.status !== 200) throw new Error(`check-key failed status=${resChk.status} body=${JSON.stringify(resChk.body)}`);
    const chk = resChk.body;

    const challenge = chk.challenge;
    const buf = Buffer.from(challenge, 'base64');
    const sign = crypto.createSign('SHA256');
    sign.update(buf);
    sign.end();
    const signature = sign.sign(privatePem).toString('base64');

    // First verify should succeed
    const resV1 = await request(app)
      .post('/api/attendance/verify-challenge')
      .set('Authorization', 'Bearer ' + token)
      .send({ challenge, signature });
    if (resV1.status !== 200) throw new Error(`first verify failed status=${resV1.status} body=${JSON.stringify(resV1.body)}`);
    const v1 = resV1.body;
    expect(v1.verified).to.equal(true);

    // Second verify with same challenge+signature should trigger replay_detected -> server revokes and returns biometricChanged
    const resV2 = await request(app)
      .post('/api/attendance/verify-challenge')
      .set('Authorization', 'Bearer ' + token)
      .send({ challenge, signature });
    if (resV2.status !== 200) throw new Error(`second verify failed status=${resV2.status} body=${JSON.stringify(resV2.body)}`);
    const v2 = resV2.body;
    expect(v2.biometricChanged).to.equal(true);

    // Confirm DB was revoked
    const after = await BiometricKey.findOne({ userId: uid });
    expect(after.status).to.equal('revoked');
    expect(after.publicKeyPem).to.be.oneOf([null, undefined]);
  });

  it('allows re-registration after revoke and successful verification', async () => {
    const uid = 'user_replay_1';
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ uid, role: 'student' }, process.env.JWT_SECRET || 'testsecret');

    // new keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

    // register new key
    await request(app)
      .post('/api/attendance/register-key')
      .set('Authorization', 'Bearer ' + token)
      .send({ publicKeyPem: publicPem })
      .expect(200);

    // approve
    const keyDoc = await BiometricKey.findOne({ userId: uid });
    keyDoc.status = 'approved';
    keyDoc.publicKeyPem = publicPem;
    await keyDoc.save();

    // get challenge
    const chk = await request(app)
      .get('/api/attendance/check-key')
      .set('Authorization', 'Bearer ' + token)
      .expect(200)
      .then((r) => r.body);
    const challenge = chk.challenge;
    const buf = Buffer.from(challenge, 'base64');
    const sign = crypto.createSign('SHA256');
    sign.update(buf);
    sign.end();
    const signature = sign.sign(privatePem).toString('base64');

    const vr = await request(app)
      .post('/api/attendance/verify-challenge')
      .set('Authorization', 'Bearer ' + token)
      .send({ challenge, signature })
      .expect(200)
      .then((r) => r.body);

    expect(vr.verified).to.equal(true);
  });

  it('marks attendance when qrToken/sessionId provided', async () => {
    const uid = 'user_attend_1';
    await User.create({ uid, email: 'a@test', role: 'student' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ uid, role: 'student' }, process.env.JWT_SECRET || 'testsecret');

    // keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

    await request(app)
      .post('/api/attendance/register-key')
      .set('Authorization', 'Bearer ' + token)
      .send({ publicKeyPem: publicPem })
      .expect(200);

    // approve
    let keyDoc = await BiometricKey.findOne({ userId: uid });
    keyDoc.status = 'approved';
    keyDoc.publicKeyPem = publicPem;
    await keyDoc.save();

    // create session doc directly
    const sessionId = 'sess_test_123';
    const qrSeed = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    await Session.create({ sessionId, professorUid: 'prof_x', qrSeed, expiresAt, createdAt: new Date() });

    // get challenge
    const chk = await request(app)
      .get('/api/attendance/check-key')
      .set('Authorization', 'Bearer ' + token)
      .expect(200)
      .then((r) => r.body);
    const challenge = chk.challenge;
    const buf = Buffer.from(challenge, 'base64');
    const sign = crypto.createSign('SHA256');
    sign.update(buf);
    sign.end();
    const signature = sign.sign(privatePem).toString('base64');

    // derive qrToken using SessionsService.deriveRotatingToken
    const SessionsService = require('../src/modules/sessions/service');
    const nowSec = Math.floor(Date.now() / 1000);
    const qrToken = SessionsService.deriveRotatingToken(qrSeed, sessionId, nowSec);

    const vr = await request(app)
      .post('/api/attendance/verify-challenge')
      .set('Authorization', 'Bearer ' + token)
      .send({ challenge, signature, qrToken, sessionId })
      .expect(200)
      .then((r) => r.body);

    expect(vr.verified).to.equal(true);
    expect(vr.attendance).to.exist;

    // Ensure attendance document exists
    const att = await Attendance.findOne({ sessionId, studentUid: uid });
    expect(att).to.exist;
  });
});
