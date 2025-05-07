/**
 * Error Handler Middleware
 * Centralized error handling for the application
 */
const logger = require('../utils/logger');

/**
 * Not found middleware
 * Handles 404 errors for undefined routes
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Error handler middleware
 * Handles all application errors
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  
  // Log error details
  logger.error(`${statusCode} - ${err.message}`, { 
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    stack: err.stack
  });
  
  // Send error response
  res.status(statusCode).json({
    error: {
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
      code: err.code || 'ERROR'
    }
  });
};

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  notFound,
  errorHandler,
  asyncHandler
};