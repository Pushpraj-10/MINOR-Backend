const User = require('../../models/user');

class FaceService {
  static async register(body) {
    const { uid, embedding, embeddingVersion = 'v1' } = body || {};
    if (!uid || !Array.isArray(embedding)) throw new Error('uid and embedding required');
    const update = {
      face: { embedding, embeddingVersion, registeredAt: new Date() },
      updatedAt: new Date(),
    };
    const user = await User.findOneAndUpdate({ uid }, update, { new: true });
    if (!user) throw new Error('user not found');
    return { ok: true };
  }

  static async verify(body) {
    // Server-side face verification is disabled in this deployment.
    // Clients should perform biometric/face verification locally and use the biometric flow.
    throw new Error('face_verification_disabled');
  }
}

function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

module.exports = FaceService;