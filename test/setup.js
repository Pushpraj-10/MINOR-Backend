const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const path = require('path');

let mongod;

module.exports = {
  async startInMemoryMongo() {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    // set a predictable JWT secret for tests
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    return mongoose.connection;
  },

  async stopInMemoryMongo() {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    if (mongod) await mongod.stop();
  },
};
