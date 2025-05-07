/**
 * Logging utility
 * Provides consistent logging across the application
 */
const winston = require('winston');
const { nodeEnv } = require('../config/env');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(
    ({ level, message, timestamp, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
      }`;
    }
  )
);

// Configure transports based on environment
const transports = [
  new winston.transports.Console({
    level: nodeEnv === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    )
  })
];

// Add file transport in production
if (nodeEnv === 'production') {
  transports.push(
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5 
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: nodeEnv === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'github-pr-reviewer' },
  transports
});

module.exports = logger;