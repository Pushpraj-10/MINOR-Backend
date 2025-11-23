// Simple scripted test for biometric flows. Run with: node test/biometric_test.js

const axios = require('axios');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const BASE = `http://localhost:${PORT}/api`;

async function registerAndLogin(email, password, role, name) {
  try { await axios.post(`${BASE}/auth/register`, { email, password, role, name }); } catch (e) {}
  await new Promise(r => setTimeout(r, 200));
  const { data } = await axios.post(`${BASE}/auth/login`, { email, password });
  return data;
}

(async () => {
  try {
    // Admin (professor) for approval
    const admin = await registerAndLogin(`prof_${Date.now()}@example.com`, 'password123', 'professor', 'Prof');

    // Student / user
    const uemail = `user_${Date.now()}@example.com`;
    const user = await registerAndLogin(uemail, 'password123', 'student', 'Student');

    console.log('User UID:', user.user.uid);

    // Request enable
    await axios.post(`${BASE}/biometrics/request-enable`, {}, { headers: { Authorization: `Bearer ${user.accessToken}` } });

    // Admin approves
    await axios.post(`${BASE}/biometrics/admin/approve`, { userId: user.user.uid }, { headers: { Authorization: `Bearer ${admin.accessToken}` } });

    // Generate ECDSA P-256 keypair (simulating device hardware key)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

    // Register public key
    await axios.post(`${BASE}/biometrics/register-key`, { publicKeyPem: publicPem }, { headers: { Authorization: `Bearer ${user.accessToken}` } });

    // Request challenge
    const chResp = await axios.get(`${BASE}/biometrics/challenge`, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    const challenge = chResp.data.challenge;
    console.log('Challenge:', challenge.slice(0,12) + '...');

    // Sign challenge
    const signer = crypto.createSign('SHA256');
    signer.update(challenge);
    signer.end();
    const signature = signer.sign(privateKey, 'base64');

    // Validate signature
    const valResp = await axios.post(`${BASE}/biometrics/validate`, { challenge, signature }, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    console.log('Validate result:', valResp.data);

    if (!valResp.data.ok) throw new Error('validation failed');

    // Now try invalid signature -> should revoke
    // Generate another key and sign
    const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const signer2 = crypto.createSign('SHA256');
    signer2.update(challenge);
    signer2.end();
    const badSig = signer2.sign(other.privateKey, 'base64');

    try {
      await axios.post(`${BASE}/biometrics/validate`, { challenge, signature: badSig }, { headers: { Authorization: `Bearer ${user.accessToken}` } });
      console.error('Expected invalid signature to fail but it succeeded');
      process.exit(1);
    } catch (err) {
      console.log('Invalid signature correctly rejected');
    }

    // Check status -> should be revoked
    const statusResp = await axios.get(`${BASE}/biometrics/status`, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    console.log('Status after invalid sig:', statusResp.data);
    if (statusResp.data.status !== 'revoked') throw new Error('expected revoked status');

    console.log('Biometric tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.response?.data || err.message || err);
    process.exit(1);
  }
})();
