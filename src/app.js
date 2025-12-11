const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const http = require('http');
require('dotenv').config();

// Initialize Firestore (required for full migration)
const { connectToFirestore } = require('./config/firestore');
let firestoreReady = false;
try {
  const _db = connectToFirestore();
  firestoreReady = !!_db;
} catch (err) {
  console.error('Firestore initialization failed:', err && err.message ? err.message : err);
}
const apiRouter = require('./router');
const { initRealtime } = require('./realtime');

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

app.set('trust proxy', 1);

// Simple root health
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'minor-backend',
    basePath: '/api'
  });
});

// API routes
app.use('/api', apiRouter);

// Internal health
app.get('/api/env', (req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV || 'development'
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Require Firestore; abort if not ready
    if (!firestoreReady) {
      throw new Error('Firestore not configured. Set FIRESTORE_URI or FIRESTORE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS.');
    }
    initRealtime(server);

    server.listen(PORT, () =>
      console.log('Server listening on port ' + PORT)
    );
  } catch (err) {
    console.error('Failed to initialize Firestore data layer:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
