const Challenge = require('../../models/challenge');

class ChallengeService {
  async set(userId, challenge, ttlSec = 60) {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    await Challenge.findOneAndUpdate(
      { userId },
      { challenge, expiresAt, used: false, createdAt: new Date() },
      { upsert: true }
    );
    console.log(
      `challengeStore.set: user=${userId} ttl=${ttlSec}s expires=${expiresAt.toISOString()}`
    );
  }

  async get(userId) {
    const now = new Date();
    const doc = await Challenge.findOneAndUpdate(
      { userId, expiresAt: { $gt: now }, used: false },
      { $set: { used: true } },
      { new: true }
    );
    if (!doc) return null;
    return doc.challenge;
  }

  async delete(userId) {
    await Challenge.deleteOne({ userId });
  }

  async destroy() {
    await Challenge.deleteMany({});
  }
}

module.exports = new ChallengeService();
