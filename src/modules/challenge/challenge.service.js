const Challenge = require('../../models/challenge');

class ChallengeService {
  async set(userId, challenge, ttlSec = 60) {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const existing = await Challenge.findOne({ userId });
    if (!existing) {
      await Challenge.create({ userId, challenge, expiresAt, used: false, createdAt: new Date() });
    } else {
      await Challenge.updateOne({ userId }, { $set: { challenge, expiresAt, used: false, createdAt: new Date() } });
    }
    console.log(
      `challengeStore.set: user=${userId} ttl=${ttlSec}s expires=${expiresAt.toISOString()}`
    );
  }

  async get(userId) {
    const now = new Date();
    const doc = await Challenge.findOne({ userId });
    if (!doc || !(new Date(doc.expiresAt).getTime() > now.getTime()) || doc.used) return null;
    await Challenge.updateOne({ userId }, { $set: { used: true } });
    if (!doc) return null;
    return doc.challenge;
  }

  async delete(userId) {
    const found = await Challenge.findOne({ userId });
    if (!found) return;
    await Challenge.deleteOne({ userId });
  }

  async destroy() {
    const all = await Challenge.find({});
    for (const c of all) {
      await Challenge.deleteOne({ userId: c.userId });
    }
  }
}

module.exports = new ChallengeService();
