/*
  Simple index migration script.
  Usage:
    set MONGO_URL=mongodb://localhost:27017/yourdb
    node scripts/create_indexes.js

  This will ensure the TTL index and unique tokenHash index exist for UsedToken,
  and also creates any important indexes for biometric keys.
*/
const mongoose = require('mongoose');
require('../src/models/usedToken');
require('../src/models/biometricKey');

const UsedToken = mongoose.model('UsedToken');
const BiometricKey = mongoose.model('BiometricKey');

async function run() {
  const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/minor';
  console.log('Connecting to', mongoUrl);
  await mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    console.log('Ensuring indexes for UsedToken...');
    await UsedToken.createIndexes();
    console.log('UsedToken indexes ensured.');

    console.log('Ensuring indexes for BiometricKey...');
    await BiometricKey.createIndexes();
    console.log('BiometricKey indexes ensured.');
  } catch (err) {
    console.error('Index creation error:', err);
    process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

run().then(() => console.log('Done')).catch((e) => { console.error(e); process.exit(1); });
