// ChallengeStore: supports an in-memory TTL-backed store (for single-instance dev)
// and an optional Redis-backed store for multi-instance production.

const USE_REDIS = String(process.env.USE_REDIS_CHALLENGE_STORE || '').toLowerCase() === 'true';

// In-memory fallback (same behavior as previous implementation)
class MemoryChallengeStore {
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

if (!USE_REDIS) {
  module.exports = new MemoryChallengeStore();
} else {
  // Redis-backed implementation
  let Redis;
  try {
    Redis = require('ioredis');
  } catch (err) {
    console.warn('ioredis not installed; falling back to memory ChallengeStore');
    module.exports = new MemoryChallengeStore();
    return;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redis = new Redis(redisUrl);

  // Prefix keys to avoid collisions
  const prefix = 'biom:challenge:';

  const store = {
    async set(userId, challenge, ttlSec = 60) {
      try {
        await redis.set(prefix + userId, challenge, 'EX', Math.max(1, Math.floor(ttlSec)));
      } catch (e) {
        console.warn('Redis set failed, falling back to no-op:', e);
      }
    },

    async get(userId) {
      try {
        const v = await redis.get(prefix + userId);
        return v === null ? null : v;
      } catch (e) {
        console.warn('Redis get failed:', e);
        return null;
      }
    },

    async delete(userId) {
      try {
        await redis.del(prefix + userId);
      } catch (e) {
        console.warn('Redis del failed:', e);
      }
    },
  };

  // Ensure the exported API matches the memory implementation (sync methods expected by call sites).
  // We'll provide thin wrappers that return synchronous-like values where possible.
  module.exports = {
    set(userId, challenge, ttlSec = 60) {
      // fire-and-forget
      store.set(userId, challenge, ttlSec).catch(() => {});
    },

    get(userId) {
      // Return a Promise-like value if caller awaits; but to keep compatibility, try a blocking read is not possible.
      // Call sites in this repo use `await challengeStore.get(...)`, so returning a Promise is acceptable.
      return store.get(userId);
    },

    delete(userId) {
      store.delete(userId).catch(() => {});
    },
  };
}