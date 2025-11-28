const { expect } = require('chai');
const request = require('supertest');
const crypto = require('crypto');

const { startInMemoryMongo, stopInMemoryMongo } = require('./setup');
const db = require('../src/config/db');
const User = require('../src/models/user');
const BiometricKey = require('../src/models/biometricKey');

let app;
let serverModule;

describe('Attendance biometric integration', function () {
  this.timeout(20000);

  before(async () => {
    try {
      await startInMemoryMongo();
      // require app after setting MONGODB_URI
      serverModule = require('../src/app');
      // connect DB via existing helper to ensure models are ready
      await db.connectToDatabase();
      app = serverModule.app;
    } catch (err) {
      console.error('before hook failed:', err && err.stack ? err.stack : err);
      throw new Error('before hook failed: ' + (err && err.message ? err.message : String(err)));
    }
  });

  after(async () => {
    await stopInMemoryMongo();
  });

  it('should register, approve, issue challenge and verify signature', async () => {
    // create test user
    const uid = 'user_test_1';
    await User.create({ uid, email: 'u@test', role: 'student' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ uid, role: 'student' }, process.env.JWT_SECRET || 'testsecret');

    // generate EC keypair (P-256)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

    // register public key
    const resReg = await request(app)
      .post('/api/attendance/register-key')
      .set('Authorization', 'Bearer ' + token)
      .send({ publicKeyPem: publicPem });
    if (resReg.status !== 200) throw new Error(`register-key failed status=${resReg.status} body=${JSON.stringify(resReg.body)}`);

    // Ensure BiometricKey doc exists
    const keyDoc = await BiometricKey.findOne({ userId: uid });
    expect(keyDoc).to.exist;

    // Approve key directly in DB (simulate admin approve)
    keyDoc.status = 'approved';
    await keyDoc.save();

    // Check-key to get challenge
    const resChk = await request(app)
      .get('/api/attendance/check-key')
      .set('Authorization', 'Bearer ' + token);
    if (resChk.status !== 200) throw new Error(`check-key failed status=${resChk.status} body=${JSON.stringify(resChk.body)}`);
    const chk = resChk.body;

    expect(chk.publicKeyRegistered).to.be.true;
    expect(chk.challenge).to.be.a('string');

    // Sign the challenge (server expects client to sign raw decoded bytes)
    const challenge = chk.challenge;
    const challengeBuf = Buffer.from(challenge, 'base64');
    const sign = crypto.createSign('SHA256');
    sign.update(challengeBuf);
    sign.end();
    const signature = sign.sign(privatePem).toString('base64');

    // Verify signature via endpoint
    const resVerify = await request(app)
      .post('/api/attendance/verify-challenge')
      .set('Authorization', 'Bearer ' + token)
      .send({ challenge, signature });
    if (resVerify.status !== 200) throw new Error(`verify-challenge failed status=${resVerify.status} body=${JSON.stringify(resVerify.body)}`);
    const verifyResp = resVerify.body;
    expect(verifyResp.verified).to.equal(true);
  });
});
