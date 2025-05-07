/**
 * Main Application
 * Sets up Express server with middleware and routes
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { nodeEnv } = require('./config/env');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const githubRoutes = require('./routes/githubRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// Create Express app
const app = express();

// Apply security headers
app.use(helmet());

// Parse JSON request body
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for webhook endpoint
    return req.path === '/github/webhook';
  }
});
app.use(limiter);

// Enable CORS
app.use(cors());

// HTTP request logging
if (nodeEnv !== 'test') {
  app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
  }));
}

// Routes
app.use('/auth', authRoutes);
app.use('/github', githubRoutes);
app.use('/review', reviewRoutes);
app.use('/notifications', notificationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

module.exports = app;