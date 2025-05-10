const axios = require("axios");
const NodeCache = require("node-cache");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getInstallationToken } = require("../utils/githubAuth");
const logger = require("../utils/logger");
const Installation = require("../models/Installation");
const tokenCache = new NodeCache({ stdTTL: 300 });
const webhookHelper = require("../helpers/webhookHelper");

class GitHubService {
  async getApiClient(installationId) {
    const token = await this.getToken(installationId);

    return axios.create({
      baseURL: "https://api.github.com",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "GitHub-PR-AI-Reviewer",
      },
    });
  }

  async getToken(installationId) {
    const cacheKey = `token-${installationId}`;

    let token = tokenCache.get(cacheKey);
    if (token) {
      return token;
    }

    token = await getInstallationToken(installationId);
    tokenCache.set(cacheKey, token);
    return token;
  }

  async getRepository(installationId, owner, repo) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error("Error fetching repository details", {
        error: error.message,
        owner,
        repo,
      });
      throw new Error(`Failed to get repository: ${error.message}`);
    }
  }

  async getPullRequest(installationId, owner, repo, prNumber) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(
        `/repos/${owner}/${repo}/pulls/${prNumber}`
      );
      return response.data;
    } catch (error) {
      logger.error("Error fetching pull request", {
        error: error.message,
        owner,
        repo,
        prNumber,
      });
      throw new Error(`Failed to get pull request: ${error.message}`);
    }
  }

  async getPullRequestFiles(installationId, owner, repo, prNumber) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(
        `/repos/${owner}/${repo}/pulls/${prNumber}/files`
      );
      return response.data;
    } catch (error) {
      logger.error("Error fetching pull request files", {
        error: error.message,
        owner,
        repo,
        prNumber,
      });
      throw new Error(`Failed to get pull request files: ${error.message}`);
    }
  }

  async getFileContent(installationId, owner, repo, path, ref) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(
        `/repos/${owner}/${repo}/contents/${path}`,
        { params: { ref } }
      );

      return Buffer.from(response.data.content, "base64").toString("utf8");
    } catch (error) {
      logger.error("Error fetching file content", {
        error: error.message,
        owner,
        repo,
        path,
        ref,
      });
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  async createReview(installationId, owner, repo, prNumber, comments, commitSha) {
    try {
      const client = await this.getApiClient(installationId);
      const reviewData = {
        commit_id: commitSha,
        body: "AI Code Review",
        event: "COMMENT",
        comments: comments.map(comment => ({
          path: comment.path,
          line: comment.line, // GitHub API should accept line numbers directly
          body: comment.body,
          side: "RIGHT" // Comment on the new version of the file
        }))
      };
      
      const response = await client.post(
        `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        reviewData
      );
      
      return response.data;
    } catch (error) {
      console.error("Review failed, fallback to regular comments", error.response?.data);
      
      // Simple fallback: just post as regular comments
      for (const comment of comments) {
        await this.addComment(
          installationId,
          owner,
          repo,
          prNumber,
          `**${comment.path}** (Line ${comment.line})\n${comment.body}`
        );
      }
    }
  }
  
  // Find exact position in diff for a specific line number
  findExactPositionInDiff(patch, targetLine) {
    const lines = patch.split('\n');
    let position = 0;
    let currentFileLine = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      position++;
      
      // Parse header to get starting line numbers
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          currentFileLine = parseInt(match[1]) - 1;
          continue;
        }
      }
      
      // Skip deleted lines (they don't exist in the new file)
      if (line.startsWith('-')) {
        continue;
      }
      
      // Count added and context lines
      if (line.startsWith('+') || line.startsWith(' ')) {
        currentFileLine++;
        
        // Check if this is our target line
        if (currentFileLine === targetLine) {
          logger.debug(`Found target line ${targetLine} at diff position ${position}`);
          return position;
        }
      }
    }
    
    logger.warn(`Could not find line ${targetLine} in diff`);
    return null;
  }

  async addComment(installationId, owner, repo, prNumber, body) {
    try {
      const client = await this.getApiClient(installationId);

      const response = await client.post(
        `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
        { body }
      );

      return response.data;
    } catch (error) {
      logger.error("Error adding comment", {
        error: error.message,
        owner,
        repo,
        prNumber,
      });
      throw new Error(`Failed to add comment: ${error.message}`);
    }
  }

  async handleWebhook(event, payload) {
    logger.info(`Received GitHub webhook: ${event}`, {
      action: payload.action,
      repository: payload.repository?.full_name,
    });

    switch (event) {
      case "installation":
        await webhookHelper.handleInstallationEvent(payload);
        break;

      case "installation_repositories":
        await webhookHelper.handleInstallationRepositoriesEvent(payload);
        break;

      case "pull_request":
        await webhookHelper.handlePullRequestEvent(payload);
        break;

      case "pull_request_review":
        // Handle PR review events if needed
        logger.info("Pull request review event received", {
          action: payload.action,
        });
        break;

      case "pull_request_review_comment":
        // Handle PR review comment events if needed
        logger.info("Pull request review comment event received", {
          action: payload.action,
        });
        break;

      default:
        logger.info(`Unhandled GitHub webhook event: ${event}`);
    }
  }

  async prepareInstallation(userId) {
    try {
      const state = crypto.randomBytes(16).toString("hex");

      // Clean up ONLY expired pending installations
      await Installation.deleteMany({
        userId,
        status: "pending",
        expiresAt: { $lt: new Date() },
      });

      // Create new pending installation
      const pendingInstallation = await Installation.create({
        userId,
        state,
        status: "pending",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      });

      // Build OAuth URL with state
      const clientId = process.env.GITHUB_CLIENT_ID;
      const appUrl = process.env.APP_URL || "http://localhost:4000";
      const redirectUri = encodeURIComponent(`${appUrl}/api/github/callback`);
      const scope = encodeURIComponent("read:user");

      const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;

      logger.info(`Prepared OAuth installation for user: ${userId}`);

      return {
        success: true,
        oauthUrl: oauthUrl,
      };
    } catch (error) {
      logger.error("Error preparing installation", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async handleOAuthCallback(code, state) {
    try {
      // Find installation by state
      const pendingInstallation = await Installation.findOne({
        state: state,
        status: "pending",
        expiresAt: { $gt: new Date() },
      });

      if (!pendingInstallation) {
        throw new Error("Invalid or expired state");
      }

      // Exchange code for token
      const tokenResponse = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: code,
        },
        {
          headers: { Accept: "application/json" },
        }
      );

      if (tokenResponse.data.error) {
        throw new Error(
          tokenResponse.data.error_description || "OAuth authentication failed"
        );
      }

      const accessToken = tokenResponse.data.access_token;

      // Get GitHub user info
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Update installation with GitHub user info
      pendingInstallation.githubUsername = userResponse.data.login;
      pendingInstallation.githubUserId = userResponse.data.id;
      pendingInstallation.status = "verified";
      pendingInstallation.verifiedAt = new Date();

      // Remove expiresAt so it won't be auto-deleted
      pendingInstallation.expiresAt = undefined;

      await pendingInstallation.save();

      // Build GitHub App installation URL
      const appSlug = process.env.GITHUB_APP_SLUG;
      const installationUrl = `https://github.com/apps/${appSlug}/installations/new`;

      logger.info(
        `OAuth verified for user: ${pendingInstallation.userId}, GitHub: ${userResponse.data.login}`
      );

      return {
        success: true,
        installationUrl: installationUrl,
      };
    } catch (error) {
      logger.error("OAuth callback error", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async verifyAndCompleteInstallation(installationId, state) {
    try {
      let stateData;
      try {
        stateData = jwt.verify(state, process.env.JWT_SECRET);
      } catch (error) {
        logger.error("Invalid state token", { error: error.message });
        return { success: false, error: "Invalid or expired state parameter" };
      }
      const pendingInstallation = await Installation.findOne({
        userId: stateData.userId,
        state: state,
        status: "pending",
        expiresAt: { $gt: new Date() },
      });

      if (!pendingInstallation) {
        return {
          success: false,
          error: "No pending installation found or it has expired",
        };
      }

      // Update the installation with GitHub data
      pendingInstallation.installationId = installationId;
      pendingInstallation.status = "verified";
      pendingInstallation.verifiedAt = new Date();
      await pendingInstallation.save();

      logger.info(`Installation verified for user: ${stateData.userId}`);

      return { success: true };
    } catch (error) {
      logger.error("Error verifying installation", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async getCommitsBetween(installationId, owner, repo, baseSha, headSha) {
    try {
      const client = await this.getApiClient(installationId);
      const response = await client.get(
        `/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`
      );
      return response.data;
    } catch (error) {
      logger.error("Error fetching commits between SHAs", {
        error: error.message,
        owner,
        repo,
        baseSha,
        headSha,
      });
      throw new Error(`Failed to get commits: ${error.message}`);
    }
  }

  async createReviewComment(installationId, owner, repo, prNumber, comment) {
    try {
      const client = await this.getApiClient(installationId);

      const response = await client.post(
        `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
        {
          body: comment.body,
          commit_id: comment.commit_id,
          path: comment.path,
          line: comment.line || comment.position,
          side: comment.side || "RIGHT",
        }
      );

      return response.data;
    } catch (error) {
      logger.error("Error creating review comment", {
        error: error.message,
        owner,
        repo,
        prNumber,
      });
      throw new Error(`Failed to create review comment: ${error.message}`);
    }
  }

  async updatePullRequestReview(
    installationId,
    owner,
    repo,
    prNumber,
    reviewId,
    event
  ) {
    try {
      const client = await this.getApiClient(installationId);

      const response = await client.put(
        `/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/events`,
        { event } // APPROVE, REQUEST_CHANGES, COMMENT
      );

      return response.data;
    } catch (error) {
      logger.error("Error updating pull request review", {
        error: error.message,
        owner,
        repo,
        prNumber,
        reviewId,
      });
      throw new Error(`Failed to update review: ${error.message}`);
    }
  }
}

module.exports = new GitHubService();
