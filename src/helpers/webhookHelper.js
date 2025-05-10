const Repository = require("../models/Repository");
const Installation = require("../models/Installation");
const PullRequest = require("../models/PullRequest");
const logger = require("../utils/logger");

const handleInstallationEvent = async (payload) => {
  const action = payload.action;
  const installation = payload.installation;

  if (action === "created" || action === "added") {
    const verifiedInstallation = await Installation.findOne({
      githubUsername: installation.account.login,
      status: "verified",
    }).sort({ verifiedAt: -1 });

    if (verifiedInstallation) {
      logger.info("Matched installation to verified user", {
        userId: verifiedInstallation.userId,
        githubUsername: installation.account.login,
      });

      await verifiedInstallation.activate({
        accountId: installation.account.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        permissions: installation.permissions,
        events: installation.events,
      });

      verifiedInstallation.installationId = installation.id;
      await verifiedInstallation.save();

      if (payload.repositories) {
        for (const repo of payload.repositories) {
          await saveRepository(repo, installation.id);
        }
      }
    } else {
      logger.warn("No verified user found for installation", {
        accountLogin: installation.account.login,
      });
    }
  } else if (action === "deleted") {
    await deactivateInstallation(installation.id);
  }
};

const handleInstallationRepositoriesEvent = async (payload) => {
  const action = payload.action;
  const installation = payload.installation;

  if (action === "added") {
    for (const repo of payload.repositories_added) {
      await saveRepository(repo, installation.id);
    }
  } else if (action === "removed") {
    for (const repo of payload.repositories_removed) {
      await deactivateRepository(repo.full_name);
    }
  }
};

const handlePullRequestEvent = async (payload) => {
  const action = payload.action;
  const pr = payload.pull_request;
  const repository = payload.repository;

  logger.info(
    `Handling PR event: ${action} for PR #${pr.number} in ${repository.full_name}`
  );

  try {
    // Find the repository in our database
    const repoDoc = await Repository.findByFullName(repository.full_name);

    if (!repoDoc) {
      logger.warn(`Repository not found: ${repository.full_name}`);
      return;
    }

    // Find the installation to get userId
    const installation = await Installation.findOne({
      installationId: repoDoc.installationId,
      status: "active",
    });

    if (!installation || !installation.userId) {
      logger.warn(
        `No active installation with userId found for repository: ${repository.full_name}`
      );
      return;
    }

    // Handle different PR actions
    if (
      action === "opened" ||
      action === "reopened" ||
      action === "synchronize" ||
      action === "edited"
    ) {
      // Prepare PR data
      const prData = {
        userId: installation.userId,
        repositoryId: repoDoc._id,
        installationId: repoDoc.installationId,
        prNumber: pr.number,
        githubPrId: pr.id,
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
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFiles: pr.changed_files || 0,
      };

      // Check if PR already exists
      let pullRequest = await PullRequest.findByRepoAndNumber(
        repoDoc._id,
        pr.number
      );

      if (pullRequest) {
        // Update existing PR
        await pullRequest.updateDetails(prData);
        logger.info(`Updated PR #${pr.number} in ${repository.full_name}`);
      } else {
        // Create new PR
        pullRequest = await PullRequest.create(prData);
        logger.info(`Created new PR #${pr.number} in ${repository.full_name}`);

        // Update repository stats
        if (repoDoc.stats) {
          repoDoc.stats.totalPRs = (repoDoc.stats.totalPRs || 0) + 1;
          await repoDoc.save();
        }
      }

      // If auto-review is enabled and this is a new PR, trigger review
      if (action === "opened" && repoDoc.configuration?.autoReview) {
        // Here you would trigger your AI review
        logger.info(`Auto-review triggered for PR #${pr.number}`);
      }
    } else if (action === "closed") {
      // Update PR state when closed
      const pullRequest = await PullRequest.findByRepoAndNumber(
        repoDoc._id,
        pr.number
      );

      if (pullRequest) {
        pullRequest.state = "closed";
        pullRequest.closedAt = new Date(pr.closed_at);

        if (pr.merged) {
          pullRequest.state = "merged";
          pullRequest.mergedAt = new Date(pr.merged_at);
        }

        await pullRequest.save();
        logger.info(
          `PR #${pr.number} ${pr.merged ? "merged" : "closed"} in ${
            repository.full_name
          }`
        );
      }
    }
  } catch (error) {
    logger.error("Error handling pull request event", {
      error: error.message,
      action,
      prNumber: pr.number,
      repository: repository.full_name,
    });
  }
};

const saveRepository = async (repo, installationId) => {
  try {
    const installationDoc = await Installation.findByInstallationId(
      installationId
    );

    if (!installationDoc) {
      logger.warn(`Installation not found: ${installationId}`);
      return;
    }

    const [owner, name] = repo.full_name.split("/");

    const repoData = {
      name: repo.name || name,
      owner: repo.owner?.login || owner,
      fullName: repo.full_name,
      githubId: repo.id,
      installationId,
      isActive: true,
    };

    let repoDoc = await Repository.findByFullName(repo.full_name);

    if (repoDoc) {
      Object.assign(repoDoc, repoData);
      await repoDoc.save();
    } else {
      repoDoc = await Repository.create(repoData);
      await installationDoc.addRepository(repoDoc._id);
    }

    logger.info(`Repository saved: ${repo.full_name}`);
    return repoDoc;
  } catch (error) {
    logger.error("Error saving repository", {
      error: error.message,
      repository: repo?.full_name,
    });
    throw error;
  }
};

const deactivateInstallation = async (installationId) => {
  try {
    const installation = await Installation.findByInstallationId(
      installationId
    );

    if (installation) {
      await installation.deactivate();

      await Repository.updateMany({ installationId }, { isActive: false });

      logger.info(`Installation deactivated: ${installationId}`);
    }
  } catch (error) {
    logger.error("Error deactivating installation", {
      error: error.message,
      installationId,
    });
    throw error;
  }
};

const deactivateRepository = async (fullName) => {
  try {
    const repository = await Repository.findByFullName(fullName);

    if (repository) {
      repository.isActive = false;
      await repository.save();

      logger.info(`Repository deactivated: ${fullName}`);
    }
  } catch (error) {
    logger.error("Error deactivating repository", {
      error: error.message,
      repository: fullName,
    });
    throw error;
  }
};

module.exports = {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
  handlePullRequestEvent,
};
