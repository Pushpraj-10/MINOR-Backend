const crypto = require('crypto');

function verifySignaturePem(publicKeyPem, challenge, signatureBase64) {
  const verify = crypto.createVerify('SHA256');
  // The challenge sent from client is Base64; the native signer signs the raw bytes.
  // Decode the Base64 challenge and feed the raw bytes to the verifier.
  const challengeBuf = Buffer.from(String(challenge || ''), 'base64');
  verify.update(challengeBuf);
  verify.end();
  const signature = Buffer.from(signatureBase64, 'base64');
  try {
    return verify.verify(publicKeyPem, signature);
  } catch (err) {
    return false;
  }
}

module.exports = { verifySignaturePem };
