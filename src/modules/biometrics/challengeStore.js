// Simple in-memory challenge store with TTL. Replaceable with Redis in production.
class ChallengeStore {
  constructor() {
    this.map = new Map();
  }

  set(userId, challenge, ttlSec = 60) {
    this.delete(userId);
    const expiresAt = Date.now() + ttlSec * 1000;
    const timeout = setTimeout(() => this.delete(userId), ttlSec * 1000 + 500);
    this.map.set(userId, { challenge, expiresAt, timeout });
  }

  get(userId) {
    const entry = this.map.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.delete(userId);
      return null;
    }
    return entry.challenge;
  }

  delete(userId) {
    const entry = this.map.get(userId);
    if (entry) {
      clearTimeout(entry.timeout);
      this.map.delete(userId);
    }
  }
}

module.exports = new ChallengeStore();
