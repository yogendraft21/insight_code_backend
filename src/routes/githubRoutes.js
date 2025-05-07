/**
 * GitHub Routes
 * Handles routes for GitHub operations
 */
const express = require('express');
const router = express.Router();
const githubController = require('../controllers/githubController');
const { authenticate, verifyWebhook } = require('../middlewares/authMiddleware');

/**
 * @route POST /github/webhook
 * @desc Handle GitHub webhook events
 * @access Public (secured by webhook signature)
 */
router.post('/webhook', verifyWebhook, githubController.webhookHandler);

/**
 * @route GET /github/repositories
 * @desc List repositories for current user
 * @access Private
 */
router.get('/repositories', authenticate, githubController.listRepositories);

/**
 * @route GET /github/repositories/:owner/:repo/config
 * @desc Get repository configuration
 * @access Private
 */
router.get('/repositories/:owner/:repo/config', authenticate, githubController.getRepositoryConfig);

/**
 * @route PUT /github/repositories/:owner/:repo/config
 * @desc Update repository configuration
 * @access Private
 */
router.put('/repositories/:owner/:repo/config', authenticate, githubController.updateRepositoryConfig);

module.exports = router;