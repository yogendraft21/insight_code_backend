/**
 * Notification Routes
 * Handles routes for notification settings
 */
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @route GET /notifications/preferences
 * @desc Get user notification preferences
 * @access Private
 */
router.get('/preferences', authenticate, notificationController.getNotificationPreferences);

/**
 * @route PUT /notifications/preferences
 * @desc Update user notification preferences
 * @access Private
 */
router.put('/preferences', authenticate, notificationController.updateNotificationPreferences);

/**
 * @route PUT /notifications/repositories/:owner/:repo
 * @desc Update repository notification settings
 * @access Private
 */
router.put('/repositories/:owner/:repo', authenticate, notificationController.updateRepositoryNotifications);

/**
 * @route POST /notifications/test
 * @desc Send test notification
 * @access Private
 */
router.post('/test', authenticate, notificationController.sendTestNotification);

module.exports = router;