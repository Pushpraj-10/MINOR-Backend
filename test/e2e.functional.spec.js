const { expect } = require('chai');
const request = require('supertest');
const crypto = require('crypto');

const { startInMemoryMongo, stopInMemoryMongo } = require('./setup');
const db = require('../src/config/db');
const User = require('../src/models/user');
const BiometricKey = require('../src/models/biometricKey');

let app;

describe('Biometrics full flow (functional)', function () {
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

  it('full register -> approve -> challenge -> verify -> no attendance recorded without session info', async () => {
    const uid = 'user_fn_1';
    await User.create({ uid, email: 'fn@test', role: 'student' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ uid, role: 'student' }, process.env.JWT_SECRET || 'testsecret');

    // gen keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

    // register
    const resReg = await request(app)
      .post('/api/attendance/register-key')
      .set('Authorization', 'Bearer ' + token)
      .send({ publicKeyPem: publicPem });
    if (resReg.status !== 200) throw new Error(`register-key failed status=${resReg.status} body=${JSON.stringify(resReg.body)}`);

    // approve
    const key = await BiometricKey.findOne({ userId: uid });
    key.status = 'approved';
    await key.save();

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

    // verify
    const resVerify = await request(app)
      .post('/api/attendance/verify-challenge')
      .set('Authorization', 'Bearer ' + token)
      .send({ challenge, signature });
    if (resVerify.status !== 200) throw new Error(`verify-challenge failed status=${resVerify.status} body=${JSON.stringify(resVerify.body)}`);
    const vr = resVerify.body;
    expect(vr.verified).to.equal(true);
  });
});
