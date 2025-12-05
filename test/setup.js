const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

before(async function () {
  this.timeout(20000);
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = 'testsecret';
  process.env.JWT_REFRESH_SECRET = 'testrefresh';
  process.env.JWT_REFRESH_MAX_AGE_MS = '604800000';
  await mongoose.connect(uri);
});

beforeEach(async function () {
  const db = mongoose.connection;
  if (!db || db.readyState !== 1) return;
  await db.dropDatabase();
});

after(async function () {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
