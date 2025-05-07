/**
 * Authentication Middleware
 * Handles user authentication and verification
 */
const authService = require('../services/authService');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Authenticate user from JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Invalid authentication format' });
    }
    
    // Verify token
    const decoded = authService.verifyToken(token);
    
    // Find user
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Add user to request
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Check if user has admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

/**
 * Verify GitHub webhook signature
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const verifyWebhook = (req, res, next) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const payload = JSON.stringify(req.body);
    
    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }
    
    const { verifyWebhookSignature } = require('../utils/githubAuth');
    const isValid = verifyWebhookSignature(signature, payload);
    
    if (!isValid) {
      logger.warn('Invalid webhook signature', { 
        signature, 
        event: req.headers['x-github-event'] 
      });
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    next();
  } catch (error) {
    logger.error('Webhook verification error', { error: error.message });
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

module.exports = {
  authenticate,
  requireAdmin,
  verifyWebhook
};