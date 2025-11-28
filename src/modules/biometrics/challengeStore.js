// ChallengeStore: Simple in-memory TTL-backed store with proper cleanup
// Redis support completely removed to eliminate race conditions

class ChallengeStore {
  constructor() {
    this.challenges = new Map();
    this.cleanupInterval = setInterval(() => this._cleanup(), 30000); // Cleanup every 30s
  }

  /**
   * Store a challenge with TTL
   * @param {string} userId - User identifier
   * @param {string} challenge - Challenge string
   * @param {number} ttlSec - Time to live in seconds (default: 60)
   */
  async set(userId, challenge, ttlSec = 60) {
    // Clear any existing challenge for this user
    await this.delete(userId);
    
    const expiresAt = Date.now() + (ttlSec * 1000);
    const entry = {
      challenge,
      expiresAt,
      used: false
    };
    
    this.challenges.set(userId, entry);
    console.log(`challengeStore.set: user=${userId} ttl=${ttlSec}s expiresAt=${new Date(expiresAt).toISOString()}`);
  }

  /**
   * Get and mark challenge as used (single-use)
   * @param {string} userId - User identifier
   * @returns {string|null} - Challenge string or null if not found/expired/used
   */
  async get(userId) {
    const entry = this.challenges.get(userId);
    if (!entry) {
      console.log(`challengeStore.get: user=${userId} no_entry`);
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      console.log(`challengeStore.get: user=${userId} expired`);
      this.challenges.delete(userId);
      return null;
    }

    // Check if already used
    if (entry.used) {
      console.log(`challengeStore.get: user=${userId} already_used`);
      return null;
    }

    // Mark as used for single-use enforcement
    entry.used = true;
    console.log(`challengeStore.get: user=${userId} success`);
    return entry.challenge;
  }

  /**
   * Delete challenge for user
   * @param {string} userId - User identifier
   */
  async delete(userId) {
    const deleted = this.challenges.delete(userId);
    if (deleted) {
      console.log(`challengeStore.delete: user=${userId} deleted`);
    }
  }

  /**
   * Internal cleanup of expired challenges
   */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, entry] of this.challenges.entries()) {
      if (now > entry.expiresAt) {
        this.challenges.delete(userId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`challengeStore._cleanup: removed ${cleaned} expired challenges`);
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let used = 0;

    for (const entry of this.challenges.values()) {
      if (now > entry.expiresAt) {
        expired++;
      } else if (entry.used) {
        used++;
      } else {
        active++;
      }
    }

    return { active, expired, used, total: this.challenges.size };
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.challenges.clear();
  }
}

// Export singleton instance
module.exports = new ChallengeStore();