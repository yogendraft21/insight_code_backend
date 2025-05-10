/**
 * Authentication Service
 * Handles user authentication and GitHub OAuth flow
 */
const axios = require("axios");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { github, jwt: jwtConfig } = require("../config/env");
const logger = require("../utils/logger");

class AuthService {
  async register(name, email, password) {
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      logger.error("Error creating user", { error: "Email already in use" });
      const error = new Error("Email already in use");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.create({
      name,
      email,
      password,
    });

    const { token, refreshToken } = this.generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save();

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    return {
      user,
      token,
      refreshToken,
    };
  }

  async login(email, password) {
    const user = await User.findByEmail(email).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      logger.error("Error while login user", {
        error: "Invalid email or password",
      });
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    const { accessToken, refreshToken } = this.generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save();

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    user.password = undefined;

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, jwtConfig.secret);

      const user = await User.findById(decoded.userId).select("+refreshToken");

      if (!user) {
        logger.error("Error refreshing token", { error: "User not found" });
        const error = new Error("User not found");
        error.statusCode = 401;
        throw error;
      }

      if (user.refreshToken !== refreshToken) {
        logger.error("Error refreshing token", {
          error: "Invalid refresh token",
        });
        const error = new Error("Invalid refresh token");
        error.statusCode = 401;
        throw error;
      }

      // Generate new tokens
      const tokens = this.generateTokens(user._id);

      // Update refresh token in database
      user.refreshToken = tokens.refreshToken;
      await user.save();

      return tokens;
    } catch (error) {
      logger.error("Error refreshing token", { error: error.message });

      // Pass through the original error if it's one we created
      if (error.statusCode) {
        throw error;
      }

      // Otherwise, create a new error
      const newError = new Error("Invalid refresh token");
      newError.statusCode = 401;
      throw newError;
    }
  }

  getGithubLoginUrl() {
    const params = new URLSearchParams({
      client_id: github.clientId,
      redirect_uri: `${process.env.APP_URL}/auth/github/callback`,
      scope: "user:email,repo",
      state: this.generateStateParam(),
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  generateStateParam() {
    return Math.random().toString(36).substring(2, 15);
  }

  async exchangeCodeForToken(code) {
    try {
      // Get access token from GitHub
      const tokenResponse = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: github.clientId,
          client_secret: github.clientSecret,
          code,
        },
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      const { access_token, refresh_token } = tokenResponse.data;

      // Get user info from GitHub
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      // Get user emails from GitHub
      const emailsResponse = await axios.get(
        "https://api.github.com/user/emails",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );

      // Find primary email
      const primaryEmail = emailsResponse.data.find(
        (email) => email.primary
      )?.email;

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        user: {
          ...userResponse.data,
          email: primaryEmail,
        },
      };
    } catch (error) {
      logger.error("GitHub OAuth error", { error: error.message });
      throw new Error(`GitHub OAuth failed: ${error.message}`);
    }
  }

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
          refreshToken,
        });
      }

      return user;
    } catch (error) {
      logger.error("Error creating/updating user", { error: error.message });
      throw new Error(`Failed to create/update user: ${error.message}`);
    }
  }

  generateTokens(userId) {
    if (!jwtConfig.secret) {
      logger.error("JWT secret not defined");
      throw new Error("JWT secret not defined");
    }

    const accessToken = jwt.sign({ userId }, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn || "1h",
    });

    const refreshToken = jwt.sign({ userId }, jwtConfig.secret, {
      expiresIn: "7d",
    });

    return { accessToken, refreshToken };
  }

  async logout(userId) {
    const user = await User.findById(userId);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    return true;
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, jwtConfig.secret);
    } catch (error) {
      logger.error("JWT verification error", { error: error.message });
      throw new Error("Invalid token");
    }
  }

  async getUserById(userId) {
    try {
      return await User.findById(userId);
    } catch (error) {
      logger.error("Error finding user", { error: error.message, userId });
      throw new Error(`Failed to find user: ${error.message}`);
    }
  }
}

module.exports = new AuthService();
