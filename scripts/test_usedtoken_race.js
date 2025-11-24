/**
 * Simple concurrency test: attempts multiple concurrent inserts of the same tokenHash
 * to ensure the DB unique index prevents duplicates and that the application can
 * observe duplicate key errors.
 *
 * Usage:
 *   set MONGO_URL=mongodb://127.0.0.1:27017/minor
 *   node scripts/test_usedtoken_race.js
 */
const mongoose = require('mongoose');
require('../src/models/usedToken');
const UsedToken = mongoose.model('UsedToken');

async function main() {
  const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/minor';
  await mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
  const tokenHash = 'race-test-' + Date.now();
  const attempts = 10;

  const promises = [];
  for (let i = 0; i < attempts; i++) {
    promises.push(
      (async () => {
        try {
          await UsedToken.create({ tokenHash, createdAt: new Date() });
          return { success: true };
        } catch (err) {
          return { success: false, err: err && err.code };
        }
      })()
    );
  }

  const results = await Promise.all(promises);
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`Attempts: ${attempts}, succeeded: ${succeeded}, failed: ${failed}`);
  console.log('Details:', results);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
