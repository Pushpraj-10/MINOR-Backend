const crypto = require('crypto');

function verifySignaturePem(publicKeyPem, challenge, signatureBase64) {
  const verify = crypto.createVerify('SHA256');
  verify.update(String(challenge));
  verify.end();
  const signature = Buffer.from(signatureBase64, 'base64');
  try {
    return verify.verify(publicKeyPem, signature);
  } catch (err) {
    return false;
  }
}

module.exports = { verifySignaturePem };
