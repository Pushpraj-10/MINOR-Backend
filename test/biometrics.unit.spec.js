const { expect } = require('chai');
const crypto = require('crypto');
const BiometricsService = require('../src/modules/biometrics/biometrics.service');
const BiometricKey = require('../src/models/biometricKey');
const { startInMemoryMongo, stopInMemoryMongo } = require('./setup');
const db = require('../src/config/db');

describe('BiometricsService unit-ish tests', function () {
  this.timeout(10000);

  before(async () => {
    await startInMemoryMongo();
    await db.connectToDatabase();
  });

  after(async () => {
    await stopInMemoryMongo();
  });

  it('validateSignature succeeds for generated keypair', async () => {
    const uid = 'user_unit_1';
    // generate keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

    // insert BiometricKey doc
    await BiometricKey.create({ userId: uid, publicKeyPem: publicPem, status: 'approved' });

    // create challenge
    const challenge = await BiometricsService.createChallenge(uid);
    expect(challenge).to.be.a('string');

    // sign raw bytes
    const buf = Buffer.from(challenge, 'base64');
    const sign = crypto.createSign('SHA256');
    sign.update(buf);
    sign.end();
    const signature = sign.sign(privatePem).toString('base64');

    const ok = await BiometricsService.validateSignature(uid, challenge, signature);
    expect(ok).to.equal(true);
  });
});
