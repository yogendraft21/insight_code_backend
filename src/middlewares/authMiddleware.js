const User = require('../models/User');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Invalid authentication format' });
    }
    
    const decoded = jwt.verify(token, jwtConfig.secret);
    
    if (!decoded.userId) {
      return res.status(401).json({ error: 'Invalid token format' });
    }
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
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

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

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