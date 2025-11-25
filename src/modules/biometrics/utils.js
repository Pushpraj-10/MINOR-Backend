const crypto = require('crypto');

function verifySignaturePem(publicKeyPem, challenge, signatureBase64) {
  const verify = crypto.createVerify('SHA256');
  // The challenge sent from client is Base64; the native signer signs the raw bytes.
  // Decode the Base64 challenge and feed the raw bytes to the verifier.
  const challengeBuf = Buffer.from(String(challenge || ''), 'base64');
  // Log challenge and signature summary for debugging
  try {
    console.log(`biometrics.utils.verifySignaturePem: challengeLen=${challengeBuf.length}`);
    // Show first 16 bytes of challenge in hex for quick comparison (not full data)
    const chHex = challengeBuf.slice(0, 16).toString('hex');
    console.log(`biometrics.utils.verifySignaturePem: challengeHexPrefix=${chHex}`);
  } catch (err) {
    console.warn('biometrics.utils.verifySignaturePem: failed to log challenge preview', err);
  }
  verify.update(challengeBuf);
  verify.end();
  const signature = Buffer.from(signatureBase64 || '', 'base64');
  try {
    console.log(`biometrics.utils.verifySignaturePem: signatureLen=${signature.length}`);
    if (signatureBase64) console.log(`biometrics.utils.verifySignaturePem: signaturePreview=${String(signatureBase64).slice(0,80)}`);
  } catch (err) {
    console.warn('biometrics.utils.verifySignaturePem: failed to log signature preview', err);
  }
  try {
    const ok = verify.verify(publicKeyPem, signature);
    console.log(`biometrics.utils.verifySignaturePem: verifyResult=${ok}`);
    return ok;
  } catch (err) {
    console.warn('biometrics.utils.verifySignaturePem: verify threw', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = { verifySignaturePem };
