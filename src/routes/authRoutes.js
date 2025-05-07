/**
 * Authentication Routes
 * Handles routes for user authentication
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @route GET /auth/github
 * @desc Redirect to GitHub OAuth login
 * @access Public
 */
router.get('/github', authController.githubLogin);

/**
 * @route GET /auth/github/callback
 * @desc Handle GitHub OAuth callback
 * @access Public
 */
router.get('/github/callback', authController.githubCallback);

/**
 * @route GET /auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', authenticate, authController.getCurrentUser);

/**
 * @route POST /auth/logout
 * @desc Log out user
 * @access Private
 */
router.post('/logout', authenticate, authController.logout);

module.exports = router;