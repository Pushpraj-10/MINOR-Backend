class ChallengeStore {
  constructor() {
    this.challenges = new Map();
    this.cleanupInterval = setInterval(() => this._cleanup(), 30000);
  }

  async set(userId, challenge, ttlSec = 60) {
    await this.delete(userId);

    const expiresAt = Date.now() + ttlSec * 1000;

    this.challenges.set(userId, {
      challenge,
      expiresAt,
      used: false
    });

    console.log(
      `challengeStore.set: user=${userId} ttl=${ttlSec}s expires=${new Date(
        expiresAt
      ).toISOString()}`
    );
  }

  async get(userId) {
    const entry = this.challenges.get(userId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.challenges.delete(userId);
      return null;
    }

    if (entry.used) return null;

    entry.used = true;
    return entry.challenge;
  }

  async delete(userId) {
    this.challenges.delete(userId);
  }

  _cleanup() {
    const now = Date.now();
    for (const [userId, entry] of this.challenges.entries()) {
      if (now > entry.expiresAt) {
        this.challenges.delete(userId);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.challenges.clear();
  }
}

module.exports = new ChallengeStore();
