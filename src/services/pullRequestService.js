// pullRequestService.js - Fixed to properly fetch repositories
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
      const existingPR = await PullRequest.findOne({
        repositoryId,
        githubPrId: prData.id,
      });

      if (existingPR) {
        return { pullRequest: existingPR, updated: false };
      }

      try {
        const uuid = require("uuid").v4;
        const dummyReviewId = uuid();

        const newPR = new PullRequest({
          userId,
          repositoryId,
          installationId,
          prNumber: prData.prNumber,
          githubPrId: prData.id,
          title: prData.title,
          description: prData.description || "",
          author: prData.author,
          state: prData.state,
          url: prData.url,
          lastCommitSha: prData.lastCommitSha,
          baseBranch: prData.baseBranch,
          headBranch: prData.headBranch,
          labels: prData.labels || [],
          closedAt: prData.closedAt,
          mergedAt: prData.mergedAt,
          additions: prData.additions || 0,
          deletions: prData.deletions || 0,
          changedFiles: prData.changedFiles || 0,
          isActive: true,
          reviews: [
            {
              reviewId: dummyReviewId,
              status: "pending",
              createdAt: new Date(),
              isPlaceholder: true,
            },
          ],
        });

        try {
          const savedPR = await newPR.save();

          if (savedPR.reviews && savedPR.reviews.length > 0) {
            await PullRequest.updateOne(
              { _id: savedPR._id },
              { $pull: { reviews: { isPlaceholder: true } } }
            );
          }

          const cleanPR = await PullRequest.findById(savedPR._id);
          return { pullRequest: cleanPR, updated: false };
        } catch (saveError) {
          throw saveError;
        }
      } catch (approachError) {
        try {
          const rawDoc = {
            userId,
            repositoryId,
            installationId,
            prNumber: prData.prNumber,
            githubPrId: prData.id,
            title: prData.title,
            description: prData.description || "",
            author: prData.author,
            state: prData.state,
            url: prData.url,
            lastCommitSha: prData.lastCommitSha,
            baseBranch: prData.baseBranch,
            headBranch: prData.headBranch,
            labels: prData.labels || [],
            closedAt: prData.closedAt,
            mergedAt: prData.mergedAt,
            additions: prData.additions || 0,
            deletions: prData.deletions || 0,
            changedFiles: prData.changedFiles || 0,
            isActive: true,
            reviews: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const collection = PullRequest.collection;
          const result = await collection.insertOne(rawDoc);

          if (result.insertedId) {
            const insertedPR = await PullRequest.findById(result.insertedId);
            return { pullRequest: insertedPR, updated: false };
          } else {
            throw new Error(
              "Failed to insert document via raw MongoDB operation"
            );
          }
        } catch (rawError) {
          throw rawError;
        }
      }
    } catch (error) {
      try {
        const possiblePR = await PullRequest.findOne({
          repositoryId,
          prNumber: prData.prNumber,
        });

        if (possiblePR) {
          return { pullRequest: possiblePR, updated: false };
        }
      } catch (lastResortError) {
        // Silent catch
      }

      throw error;
    }
  }

  async syncRepositoryPullRequests(repositoryId, userId) {
    try {
      const repository = await Repository.findById(repositoryId);
      if (!repository) return 0;

      const client = await githubService.getApiClient(
        repository.installationId
      );
      const response = await client.get(
        `/repos/${repository.owner}/${repository.name}/pulls`,
        { params: { state: "all", per_page: 100 } }
      );

      console.log("Fetched pull requests:", response.data);
      let syncedCount = 0;
      for (const pr of response.data) {
        try {
          const prData = {
            prNumber: pr.number,
            id: pr.id,
            title: pr.title,
            description: pr.body || "",
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
            closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            additions: pr.additions || 0,
            deletions: pr.deletions || 0,
            changedFiles: pr.changed_files || 0,
          };

          await this.createOrUpdatePullRequest(
            prData,
            repositoryId,
            userId,
            repository.installationId
          );
          syncedCount++;
        } catch (error) {
          continue;
        }
      }
      return syncedCount;
    } catch (error) {
      throw error;
    }
  }

  async syncAllUserRepositories(userId) {
    try {
      const installations = await Installation.find({
        userId,
        status: "active",
        isActive: true,
      });

      let totalSynced = 0;
      for (const installation of installations) {
        const repositories = await Repository.find({
          installationId: installation.installationId,
          isActive: true,
        });

        for (const repository of repositories) {
          try {
            const count = await this.syncRepositoryPullRequests(
              repository._id,
              userId
            );
            totalSynced += count;
          } catch (error) {
            continue;
          }
        }
      }
      return totalSynced;
    } catch (error) {
      throw error;
    }
  }

  // Rest of the methods remain the same...
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

  async triggerReview(pullRequestId) {
    try {
      const pullRequest = await PullRequest.findById(pullRequestId).populate(
        "repositoryId"
      );

      if (!pullRequest) {
        throw new Error("Pull request not found");
      }

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

  async getPullRequestDetails(pullRequestId) {
    try {
      const pullRequest = await PullRequest.findById(pullRequestId).populate(
        "repositoryId",
        "name owner fullName"
      );

      if (!pullRequest) {
        throw new Error("Pull request not found");
      }

      return pullRequest;
    } catch (error) {
      logger.error("Error fetching pull request details", {
        error: error.message,
      });
      throw error;
    }
  }

  async getReviewDetails(pullRequestId, reviewId) {
    try {
      const pullRequest = await PullRequest.findById(pullRequestId);

      if (!pullRequest) {
        throw new Error("Pull request not found");
      }

      const review = pullRequest.reviews.find((r) => r.reviewId === reviewId);

      if (!review) {
        throw new Error("Review not found");
      }

      return review;
    } catch (error) {
      logger.error("Error fetching review details", {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new PullRequestService();
