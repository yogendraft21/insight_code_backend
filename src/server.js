/**
 * Server Entry Point
 * Starts the application server
 */
const app = require('./app');
const { connectDB } = require('./config/db');
const { port } = require('./config/env');
const logger = require('./utils/logger');

// Start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start Express server
    const server = app.listen(port, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${port}`);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled Rejection:', err);
      
      // Close server and exit process
      server.close(() => {
        logger.info('Server closed due to unhandled promise rejection');
        process.exit(1);
      });
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      
      // Close server and exit process
      server.close(() => {
        logger.info('Server closed due to uncaught exception');
        process.exit(1);
      });
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { startServer };