/**
 * Authentication Service
 * Handles user authentication and GitHub OAuth flow
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { github, jwt: jwtConfig } = require('../config/env');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Get GitHub OAuth login URL
   * @returns {string} GitHub OAuth URL
   */
  getGithubLoginUrl() {
    const params = new URLSearchParams({
      client_id: github.clientId,
      redirect_uri: `${process.env.APP_URL}/auth/github/callback`,
      scope: 'user:email,repo',
      state: this.generateStateParam()
    });
    
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Generate random state parameter for OAuth
   * @returns {string} Random state string
   */
  generateStateParam() {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Exchange GitHub code for access token
   * @param {string} code - GitHub OAuth code
   * @returns {Object} GitHub tokens and user info
   */
  async exchangeCodeForToken(code) {
    try {
      // Get access token from GitHub
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: github.clientId,
          client_secret: github.clientSecret,
          code
        },
        {
          headers: {
            Accept: 'application/json'
          }
        }
      );
      
      const { access_token, refresh_token } = tokenResponse.data;
      
      // Get user info from GitHub
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      
      // Get user emails from GitHub
      const emailsResponse = await axios.get('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      
      // Find primary email
      const primaryEmail = emailsResponse.data.find(email => email.primary)?.email;
      
      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        user: {
          ...userResponse.data,
          email: primaryEmail
        }
      };
    } catch (error) {
      logger.error('GitHub OAuth error', { error: error.message });
      throw new Error(`GitHub OAuth failed: ${error.message}`);
    }
  }

  /**
   * Create or update user from GitHub data
   * @param {Object} userData - GitHub user data
   * @param {string} accessToken - GitHub access token
   * @param {string} refreshToken - GitHub refresh token
   * @returns {Object} User document
   */
  async createOrUpdateUser(userData, accessToken, refreshToken) {
    try {
      // Check if user exists
      let user = await User.findByGithubId(userData.id);
      
      if (user) {
        // Update existing user
        user.username = userData.login;
        user.name = userData.name;
        user.email = userData.email;
        user.avatarUrl = userData.avatar_url;
        user.accessToken = accessToken;
        if (refreshToken) {
          user.refreshToken = refreshToken;
        }
        user.lastLogin = Date.now();
        
        await user.save();
      } else {
        // Create new user
        user = await User.create({
          githubId: userData.id,
          username: userData.login,
          name: userData.name,
          email: userData.email,
          avatarUrl: userData.avatar_url,
          accessToken,
          refreshToken
        });
      }
      
      return user;
    } catch (error) {
      logger.error('Error creating/updating user', { error: error.message });
      throw new Error(`Failed to create/update user: ${error.message}`);
    }
  }

  /**
   * Generate JWT token for user
   * @param {Object} user - User document
   * @returns {string} JWT token
   */
  generateToken(user) {
    const payload = {
      id: user._id,
      githubId: user.githubId,
      username: user.username,
      role: user.role
    };
    
    return jwt.sign(payload, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn
    });
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, jwtConfig.secret);
    } catch (error) {
      logger.error('JWT verification error', { error: error.message });
      throw new Error('Invalid token');
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Object} User document
   */
  async getUserById(userId) {
    try {
      return await User.findById(userId);
    } catch (error) {
      logger.error('Error finding user', { error: error.message, userId });
      throw new Error(`Failed to find user: ${error.message}`);
    }
  }
}

module.exports = new AuthService();