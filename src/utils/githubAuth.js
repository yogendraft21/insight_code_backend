/**
 * GitHub authentication utilities
 * Handles token generation, validation and GitHub app authentication
 */
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { github } = require('../config/env');
const logger = require('./logger');

/**
 * Generate JWT for GitHub App
 * @returns {string} JWT token for GitHub App authentication
 */
const generateAppJwt = () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + (10 * 60), // JWT expires in 10 minutes
    iss: github.appId
  };

  return jwt.sign(payload, github.privateKey, { algorithm: 'RS256' });
};

/**
 * Get installation access token for a specific installation
 * @param {string} installationId - The GitHub App installation ID
 * @returns {Promise<string>} Installation access token
 */
const getInstallationToken = async (installationId) => {
  try {
    const appJwt = generateAppJwt();
    const response = await axios.post(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {},
      {
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    return response.data.token;
  } catch (error) {
    logger.error('Error getting installation token', { 
      error: error.message, 
      installationId 
    });
    throw new Error(`Failed to get installation token: ${error.message}`);
  }
};

/**
 * Verify GitHub webhook signature
 * @param {string} signature - GitHub signature header
 * @param {string} payload - Request body as string
 * @returns {boolean} Whether signature is valid
 */
const verifyWebhookSignature = (signature, payload) => {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', github.webhookSecret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
};

module.exports = {
  generateAppJwt,
  getInstallationToken,
  verifyWebhookSignature
};