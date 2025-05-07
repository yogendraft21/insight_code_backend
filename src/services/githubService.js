/**
 * GitHub Service
 * Handles interactions with the GitHub API
 */
const axios = require('axios');
const NodeCache = require('node-cache');
const { getInstallationToken } = require('../utils/githubAuth');
const logger = require('../utils/logger');

// Cache for installation tokens (5 min TTL)
const tokenCache = new NodeCache({ stdTTL: 300 });

class GitHubService {
  /**
   * Get authenticated GitHub API client for an installation
   * @param {number} installationId - GitHub installation ID
   * @returns {Object} Axios instance configured for GitHub API
   */
  async getApiClient(installationId) {
    const token = await this.getToken(installationId);
    
    return axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-PR-AI-Reviewer'
      }
    });
  }

  /**
   * Get installation token (with caching)
   * @param {number} installationId - GitHub installation ID
   * @returns {string} Installation access token
   */
  async getToken(installationId) {
    const cacheKey = `token-${installationId}`;
    
    // Check cache first
    let token = tokenCache.get(cacheKey);
    if (token) {
      return token;
    }
    
    // Get new token
    token = await getInstallationToken(installationId);
    tokenCache.set(cacheKey, token);
    return token;
  }

  /**
   * Get repository details
   * @param {number} installationId - GitHub installation ID
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Object} Repository details
   */
  async getRepository(installationId, owner, repo) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching repository details', { 
        error: error.message, owner, repo 
      });
      throw new Error(`Failed to get repository: ${error.message}`);
    }
  }

  /**
   * Get pull request details
   * @param {number} installationId - GitHub installation ID
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @returns {Object} Pull request details
   */
  async getPullRequest(installationId, owner, repo, prNumber) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(`/repos/${owner}/${repo}/pulls/${prNumber}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching pull request', { 
        error: error.message, owner, repo, prNumber 
      });
      throw new Error(`Failed to get pull request: ${error.message}`);
    }
  }

  /**
   * Get pull request files
   * @param {number} installationId - GitHub installation ID
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @returns {Array} List of files changed in the pull request
   */
  async getPullRequestFiles(installationId, owner, repo, prNumber) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching pull request files', { 
        error: error.message, owner, repo, prNumber 
      });
      throw new Error(`Failed to get pull request files: ${error.message}`);
    }
  }

  /**
   * Get file content
   * @param {number} installationId - GitHub installation ID
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} path - File path
   * @param {string} ref - Git reference (branch, commit)
   * @returns {string} File content
   */
  async getFileContent(installationId, owner, repo, path, ref) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(
        `/repos/${owner}/${repo}/contents/${path}`,
        { params: { ref } }
      );
      
      // Decode content from base64
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
      logger.error('Error fetching file content', { 
        error: error.message, owner, repo, path, ref 
      });
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  /**
   * Post a review comment on a pull request
   * @param {number} installationId - GitHub installation ID
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @param {Array} comments - Review comments
   * @param {string} commitId - Commit SHA
   * @returns {Object} Review result
   */
  async createReview(installationId, owner, repo, prNumber, comments, commitId) {
    try {
      const client = await this.getApiClient(installationId);
      
      const response = await client.post(
        `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        {
          commit_id: commitId,
          comments: comments.map(comment => ({
            path: comment.path,
            line: comment.line,
            body: comment.comment
          })),
          event: 'COMMENT'
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('Error creating review', { 
        error: error.message, owner, repo, prNumber 
      });
      throw new Error(`Failed to create review: ${error.message}`);
    }
  }

  /**
   * Add a summary comment to a pull request
   * @param {number} installationId - GitHub installation ID
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - Pull request number
   * @param {string} body - Comment body
   * @returns {Object} Comment result
   */
  async addComment(installationId, owner, repo, prNumber, body) {
    try {
      const client = await this.getApiClient(installationId);
      
      const response = await client.post(
        `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
        { body }
      );
      
      return response.data;
    } catch (error) {
      logger.error('Error adding comment', { 
        error: error.message, owner, repo, prNumber 
      });
      throw new Error(`Failed to add comment: ${error.message}`);
    }
  }
}

module.exports = new GitHubService();