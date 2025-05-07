/**
 * Authentication Controller
 * Handles GitHub OAuth authentication flow
 */
const authService = require('../services/authService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middlewares/errorHandler');

/**
 * Redirect to GitHub OAuth login page
 * @route GET /auth/github
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const githubLogin = (req, res) => {
  const loginUrl = authService.getGithubLoginUrl();
  res.redirect(loginUrl);
};

/**
 * GitHub OAuth callback handler
 * @route GET /auth/github/callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const githubCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }
  
  try {
    // Exchange code for tokens
    const { accessToken, refreshToken, user: githubUser } = await authService.exchangeCodeForToken(code);
    
    // Create or update user in database
    const user = await authService.createOrUpdateUser(githubUser, accessToken, refreshToken);
    
    // Generate JWT token
    const token = authService.generateToken(user);
    
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    logger.error('GitHub callback error', { error: error.message });
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error.message)}`);
  }
});

/**
 * Get current user profile
 * @route GET /auth/me
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  // User is already attached to req by the auth middleware
  res.json({ user: req.user });
});

/**
 * Log out user
 * @route POST /auth/logout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const logout = (req, res) => {
  // We don't need to do anything on the backend for logout
  // The frontend should remove the token
  res.json({ message: 'Logout successful' });
};

module.exports = {
  githubLogin,
  githubCallback,
  getCurrentUser,
  logout
};