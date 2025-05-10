const authService = require('../services/authService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middlewares/errorHandler');

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.register(name, email, password);
  
  res.status(201).json({
    user,
    accessToken,
    refreshToken
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login(email, password);

  res.json({
    user,
    accessToken,
    refreshToken
  });
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const tokens = await authService.refreshAccessToken(refreshToken);
  
  res.json(tokens);
});

const githubLogin = (req, res) => {
  const loginUrl = authService.getGithubLoginUrl();
  res.redirect(loginUrl);
};

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

    // 🔁 Redirect to frontend with JWT token in query
    const redirectUrl = `${process.env.FRONTEND_URL}/dashboard/repositories?token=${token}`;
    res.redirect(redirectUrl);
    
  } catch (error) {
    logger.error('GitHub callback error', { error: error.message });
    
    // 🔁 Redirect to frontend error page
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error.message)}`);
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  // User is already attached to req by the auth middleware
  res.json({ user: req.user });
});

const logout = (req, res) => {
  // We don't need to do anything on the backend for logout
  // The frontend should remove the token
  res.json({ message: 'Logout successful' });
};

module.exports = {
  register,
  login,
  refreshToken,
  githubLogin,
  githubCallback,
  getCurrentUser,
  logout
};