const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const http = require('http');
require('dotenv').config();

const { connectToDatabase } = require('./config/db');
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
    await connectToDatabase();
    initRealtime(server);

    server.listen(PORT, () =>
      console.log('Server listening on port ' + PORT)
    );
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
