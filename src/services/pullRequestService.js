const PullRequest = require("../models/PullRequest");
const Repository = require("../models/Repository");
const Installation = require("../models/Installation");
const githubService = require("./githubService");
const logger = require("../utils/logger");

class PullRequestService {
  async createOrUpdatePullRequest(
    prData,
    repositoryId,
    userId,
    installationId
  ) {
    try {
      let pullRequest = await PullRequest.findByRepoAndNumber(
        repositoryId,
        prData.prNumber
      );

      const prDetails = {
        ...prData,
        userId,
        repositoryId,
        installationId,
        githubPrId: prData.id,
        // Don't include reviews in the update data
      };

      if (pullRequest) {
        // Update existing PR without touching reviews
        pullRequest = await PullRequest.findOneAndUpdate(
          { repositoryId, prNumber: prData.prNumber },
          { $set: prDetails },
          { new: true }
        );
        logger.info(`Updated pull request #${prData.prNumber}`);
      } else {
        // Create new PR with empty reviews array
        prDetails.reviews = [];
        pullRequest = await PullRequest.create(prDetails);
        logger.info(`Created new pull request #${prData.prNumber}`);
      }

      return pullRequest;
    } catch (error) {
      logger.error("Error creating/updating pull request", {
        error: error.message,
      });
      throw error;
    }
  }

  async getUserPullRequests(userId, options = {}) {
    try {
      const pullRequests = await PullRequest.findByUser(
        userId,
        options
      ).populate("repositoryId", "name owner fullName");

      return pullRequests;
    } catch (error) {
      logger.error("Error fetching user pull requests", {
        error: error.message,
      });
      throw error;
    }
  }

  async getRepositoryPullRequests(repositoryId, options = {}) {
    try {
      const pullRequests = await PullRequest.findByRepository(
        repositoryId,
        options
      );
      return pullRequests;
    } catch (error) {
      logger.error("Error fetching repository pull requests", {
        error: error.message,
      });
      throw error;
    }
  }

  async syncRepositoryPullRequests(repositoryId) {
    try {
      const repository = await Repository.findById(repositoryId);
      if (!repository) {
        throw new Error("Repository not found");
      }
  
      const installation = await Installation.findOne({
        installationId: repository.installationId,
        status: "active",
      });
  
      if (!installation) {
        throw new Error("No active installation found for repository");
      }
  
      const client = await githubService.getApiClient(
        repository.installationId
      );
      
      const response = await client.get(
        `/repos/${repository.owner}/${repository.name}/pulls`,
        {
          params: { state: "all", per_page: 100 },
        }
      );
  
      const pullRequests = response.data;
      let syncedCount = 0;
  
      for (const pr of pullRequests) {
        try {
          const prData = {
            prNumber: pr.number,
            title: pr.title,
            description: pr.body,
            author: {
              githubId: pr.user.id.toString(),
              username: pr.user.login,
              avatarUrl: pr.user.avatar_url,
            },
            state: pr.state,
            url: pr.html_url,
            lastCommitSha: pr.head.sha,
            baseBranch: pr.base.ref,
            headBranch: pr.head.ref,
            labels: pr.labels.map((label) => label.name),
            id: pr.id,
          };
  
          await this.createOrUpdatePullRequest(
            prData,
            repositoryId,
            installation.userId,
            repository.installationId
          );
          
          syncedCount++;
        } catch (error) {
          logger.error(`Error syncing PR #${pr.number}`, {
            error: error.message,
            prNumber: pr.number,
            repository: repository.fullName
          });
          // Continue with next PR instead of failing entire sync
        }
      }
  
      logger.info(
        `Synced ${syncedCount} of ${pullRequests.length} pull requests for repository ${repository.fullName}`
      );
      return syncedCount;
    } catch (error) {
      logger.error("Error syncing repository pull requests", {
        error: error.message,
        repositoryId
      });
      throw error;
    }
  }

  async syncAllUserRepositories(userId) {
    try {
      const installation = await Installation.findOne({
        userId,
        status: "active",
      });

      if (!installation) {
        throw new Error("No active installation found for user");
      }

      const repositories = await Repository.find({
        installationId: installation.installationId,
        isActive: true,
      });

      let totalSynced = 0;
      for (const repository of repositories) {
        const count = await this.syncRepositoryPullRequests(repository._id);
        totalSynced += count;
      }

      return totalSynced;
    } catch (error) {
      logger.error("Error syncing all user repositories", {
        error: error.message,
      });
      throw error;
    }
  }

  async triggerReview(pullRequestId) {
    try {
      const pullRequest = await PullRequest.findById(pullRequestId).populate(
        "repositoryId"
      );

      if (!pullRequest) {
        throw new Error("Pull request not found");
      }

      // This would call your AI review service
      // For now, just mark as in progress
      const reviewId = `review_${Date.now()}`;
      await pullRequest.addReview({
        reviewId,
        status: "in_progress",
      });

      logger.info(`Triggered review for PR #${pullRequest.prNumber}`);
      return reviewId;
    } catch (error) {
      logger.error("Error triggering review", { error: error.message });
      throw error;
    }
  }
}

module.exports = new PullRequestService();
