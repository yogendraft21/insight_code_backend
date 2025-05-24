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
const pullRequestRoutes = require('./routes/pullRequestRoutes');
const subscriptionRoutes = require('./routes/subscription.routes');
const creditRoutes = require('./routes/credit.routes');
const billingRoutes = require('./routes/billing.routes');

// Create Express app
const app = express();

// Apply security headers
app.use(helmet());

// Special handling for Stripe webhooks (raw body) - MUST be before express.json()
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

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
    // Skip rate limiting for webhook endpoints
    return req.path === '/github/webhook' || req.path === '/api/subscription/webhook';
  }
});
app.use(limiter);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());

// HTTP request logging
if (nodeEnv !== 'test') {
  app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
  }));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/pull-requests', pullRequestRoutes);

// New subscription routes
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/billing', billingRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

module.exports = app;