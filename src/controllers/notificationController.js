/**
 * Notification Controller
 * Handles notification settings and configuration
 */
const User = require('../models/User');
const Repository = require('../models/Repository');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middlewares/errorHandler');

/**
 * Update user notification preferences
 * @route PUT /notifications/preferences
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { email, slack } = req.body;
  
  // Validate input
  if (!email && !slack) {
    return res.status(400).json({ error: 'No notification settings provided' });
  }
  
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update preferences
    if (email) {
      user.notificationPreferences.email = {
        ...user.notificationPreferences.email,
        ...email
      };
    }
    
    if (slack) {
      user.notificationPreferences.slack = {
        ...user.notificationPreferences.slack,
        ...slack
      };
    }
    
    await user.save();
    
    res.json({ 
      message: 'Notification preferences updated',
      preferences: user.notificationPreferences
    });
  } catch (error) {
    logger.error('Error updating notification preferences', { 
      error: error.message,
      userId
    });
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

/**
 * Get user notification preferences
 * @route GET /notifications/preferences
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ preferences: user.notificationPreferences });
  } catch (error) {
    logger.error('Error fetching notification preferences', { 
      error: error.message,
      userId
    });
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

/**
 * Update repository notification settings
 * @route PUT /notifications/repositories/:owner/:repo
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateRepositoryNotifications = asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const { notifyOnOpen, notifyOnUpdate, codeOwners } = req.body;
  
  try {
    const repository = await Repository.findByFullName(`${owner}/${repo}`);
    
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Update notification settings
    if (notifyOnOpen !== undefined) {
      repository.configuration.notifyOnOpen = notifyOnOpen;
    }
    
    if (notifyOnUpdate !== undefined) {
      repository.configuration.notifyOnUpdate = notifyOnUpdate;
    }
    
    if (codeOwners) {
      repository.configuration.codeOwners = codeOwners;
    }
    
    await repository.save();
    
    res.json({ 
      message: 'Repository notification settings updated',
      settings: {
        notifyOnOpen: repository.configuration.notifyOnOpen,
        notifyOnUpdate: repository.configuration.notifyOnUpdate,
        codeOwners: repository.configuration.codeOwners
      }
    });
  } catch (error) {
    logger.error('Error updating repository notifications', { 
      error: error.message,
      owner,
      repo
    });
    res.status(500).json({ error: 'Failed to update repository notifications' });
  }
});

/**
 * Send test notification
 * @route POST /notifications/test
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendTestNotification = asyncHandler(async (req, res) => {
  const { channels } = req.body;
  const user = req.user;
  
  try {
    // Prepare test data
    const testData = {
      title: 'Test Notification',
      repository: 'test/repository',
      url: 'https://example.com',
      summary: 'This is a test notification from the PR AI Reviewer system.'
    };
    
    // Prepare recipients based on user preferences
    const recipients = {};
    
    if (user.notificationPreferences.email.enabled) {
      recipients.email = user.notificationPreferences.email.address || user.email;
    }
    
    // Send notification
    const result = await notificationService.send({
      type: 'test',
      data: testData,
      channels: channels || ['slack', 'email'],
      recipients
    });
    
    res.json({ 
      message: 'Test notification sent',
      result
    });
  } catch (error) {
    logger.error('Error sending test notification', { 
      error: error.message,
      userId: user._id
    });
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = {
  updateNotificationPreferences,
  getNotificationPreferences,
  updateRepositoryNotifications,
  sendTestNotification
};