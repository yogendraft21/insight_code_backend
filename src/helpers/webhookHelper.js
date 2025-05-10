const Repository = require('../models/Repository');
const Installation = require('../models/Installation');
const PullRequest = require('../models/PullRequest');
const reviewController = require('../controllers/reviewController');
const logger = require('../utils/logger');

const handleInstallationEvent = async (payload) => {
  const action = payload.action;
  const installation = payload.installation;
  
  if (action === 'created' || action === 'added') {
    const verifiedInstallation = await Installation.findOne({
      githubUsername: installation.account.login,
      status: 'verified'
    }).sort({ verifiedAt: -1 });
    
    if (verifiedInstallation) {
      logger.info('Matched installation to verified user', { 
        userId: verifiedInstallation.userId,
        githubUsername: installation.account.login
      });
      
      await verifiedInstallation.activate({
        accountId: installation.account.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        permissions: installation.permissions,
        events: installation.events
      });
      
      verifiedInstallation.installationId = installation.id;
      await verifiedInstallation.save();
      
      if (payload.repositories) {
        for (const repo of payload.repositories) {
          await saveRepository(repo, installation.id);
        }
      }
    } else {
      logger.warn('No verified user found for installation', { 
        accountLogin: installation.account.login
      });
    }
  } else if (action === 'deleted') {
    await deactivateInstallation(installation.id);
  }
};

const handleInstallationRepositoriesEvent = async (payload) => {
  const action = payload.action;
  const installation = payload.installation;
  
  if (action === 'added') {
    for (const repo of payload.repositories_added) {
      await saveRepository(repo, installation.id);
    }
  } else if (action === 'removed') {
    for (const repo of payload.repositories_removed) {
      await deactivateRepository(repo.full_name);
    }
  }
};

const handlePullRequestEvent = async (payload) => {
  const action = payload.action;
  const pr = payload.pull_request;
  const repository = payload.repository;
  
  const repoDoc = await Repository.findByFullName(repository.full_name);
  
  if (!repoDoc) {
    logger.warn(`Repository not found: ${repository.full_name}`);
    return;
  }
  
  if (action === 'opened' || action === 'reopened' || action === 'synchronize') {
    const prData = {
      repositoryId: repoDoc._id,
      prNumber: pr.number,
      title: pr.title,
      description: pr.body,
      author: {
        githubId: pr.user.id.toString(),
        username: pr.user.login,
        avatarUrl: pr.user.avatar_url
      },
      state: pr.state,
      url: pr.html_url,
      lastCommitSha: pr.head.sha,
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      labels: pr.labels.map(label => label.name)
    };
    
    let prDoc = await PullRequest.findByRepoAndNumber(repoDoc._id, pr.number);
    
    if (prDoc) {
      await prDoc.updateDetails(prData);
    } else {
      prDoc = await PullRequest.create(prData);
      await repoDoc.incrementPRCount();
    }
    
    if (repoDoc.configuration.autoReview) {
      await reviewController.triggerReview(repoDoc.installationId, repository.owner.login, repository.name, pr.number);
    }
  } else if (action === 'closed') {
    const prDoc = await PullRequest.findByRepoAndNumber(repoDoc._id, pr.number);
    
    if (prDoc) {
      prDoc.state = 'closed';
      if (pr.merged) {
        prDoc.state = 'merged';
        prDoc.mergedAt = new Date(pr.merged_at);
      }
      prDoc.closedAt = new Date(pr.closed_at);
      await prDoc.save();
    }
  }
};

const saveRepository = async (repo, installationId) => {
  try {
    const installationDoc = await Installation.findByInstallationId(installationId);
    
    if (!installationDoc) {
      logger.warn(`Installation not found: ${installationId}`);
      return;
    }
    
    const [owner, name] = repo.full_name.split('/');
    
    const repoData = {
      name: repo.name || name,
      owner: repo.owner?.login || owner,
      fullName: repo.full_name,
      githubId: repo.id,
      installationId,
      isActive: true
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
    logger.error('Error saving repository', { 
      error: error.message,
      repository: repo?.full_name
    });
    throw error;
  }
};

const deactivateInstallation = async (installationId) => {
  try {
    const installation = await Installation.findByInstallationId(installationId);
    
    if (installation) {
      await installation.deactivate();
      
      await Repository.updateMany(
        { installationId },
        { isActive: false }
      );
      
      logger.info(`Installation deactivated: ${installationId}`);
    }
  } catch (error) {
    logger.error('Error deactivating installation', { 
      error: error.message,
      installationId
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
    logger.error('Error deactivating repository', { 
      error: error.message,
      repository: fullName
    });
    throw error;
  }
};

module.exports = {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
  handlePullRequestEvent
};