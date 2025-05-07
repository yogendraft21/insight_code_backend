/**
 * GitHub Controller
 * Handles GitHub webhook events and repository operations
 */
const Repository = require('../models/Repository');
const Installation = require('../models/Installation');
const PullRequest = require('../models/PullRequest');
const githubService = require('../services/githubService');
const reviewController = require('./reviewController');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middlewares/errorHandler');

/**
 * Handle GitHub webhook events
 * @route POST /github/webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const webhookHandler = asyncHandler(async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;
  
  logger.info(`Received GitHub webhook: ${event}`, { 
    action: payload.action,
    repository: payload.repository?.full_name
  });
  
  // Process webhook based on event type
  switch (event) {
    case 'installation':
      await handleInstallationEvent(payload);
      break;
      
    case 'installation_repositories':
      await handleInstallationRepositoriesEvent(payload);
      break;
      
    case 'pull_request':
      await handlePullRequestEvent(payload);
      break;
      
    default:
      logger.info(`Unhandled GitHub webhook event: ${event}`);
  }
  
  // Always respond to GitHub with a 200 status
  res.status(200).json({ message: 'Webhook received' });
});

/**
 * Handle installation event (app installed/uninstalled)
 * @param {Object} payload - Webhook payload
 */
const handleInstallationEvent = async (payload) => {
  const action = payload.action;
  const installation = payload.installation;
  
  if (action === 'created' || action === 'added') {
    // App installed or added to repositories
    await saveInstallation(installation);
    
    // Save repositories
    if (payload.repositories) {
      for (const repo of payload.repositories) {
        await saveRepository(repo, installation.id);
      }
    }
  } else if (action === 'deleted') {
    // App uninstalled
    await deactivateInstallation(installation.id);
  }
};

/**
 * Handle installation repositories event (repos added/removed)
 * @param {Object} payload - Webhook payload
 */
const handleInstallationRepositoriesEvent = async (payload) => {
  const action = payload.action;
  const installation = payload.installation;
  
  if (action === 'added') {
    // Repositories added to installation
    for (const repo of payload.repositories_added) {
      await saveRepository(repo, installation.id);
    }
  } else if (action === 'removed') {
    // Repositories removed from installation
    for (const repo of payload.repositories_removed) {
      await deactivateRepository(repo.full_name);
    }
  }
};

/**
 * Handle pull request event
 * @param {Object} payload - Webhook payload
 */
const handlePullRequestEvent = async (payload) => {
  const action = payload.action;
  const pr = payload.pull_request;
  const repository = payload.repository;
  
  // Find repository in database
  const repoDoc = await Repository.findByFullName(repository.full_name);
  
  if (!repoDoc) {
    logger.warn(`Repository not found: ${repository.full_name}`);
    return;
  }
  
  if (action === 'opened' || action === 'reopened' || action === 'synchronize') {
    // Save or update PR details
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
      // Update existing PR
      await prDoc.updateDetails(prData);
    } else {
      // Create new PR
      prDoc = await PullRequest.create(prData);
      
      // Update repository stats
      await repoDoc.incrementPRCount();
    }
    
    // Check if auto-review is enabled for this repository
    if (repoDoc.configuration.autoReview) {
      // Trigger review
      await reviewController.triggerReview(repoDoc.installationId, repository.owner.login, repository.name, pr.number);
    }
  } else if (action === 'closed') {
    // Update PR state
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

/**
 * Save installation details
 * @param {Object} installation - Installation data from GitHub
 */
const saveInstallation = async (installation) => {
  try {
    const installationData = {
      installationId: installation.id,
      accountId: installation.account.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      permissions: installation.permissions,
      events: installation.events,
      isActive: true
    };
    
    let installationDoc = await Installation.findByInstallationId(installation.id);
    
    if (installationDoc) {
      await installationDoc.updateDetails(installationData);
    } else {
      installationDoc = await Installation.create(installationData);
    }
    
    logger.info(`Installation saved: ${installation.account.login}`);
    return installationDoc;
  } catch (error) {
    logger.error('Error saving installation', { error: error.message });
    throw error;
  }
};

/**
 * Deactivate installation
 * @param {number} installationId - GitHub installation ID
 */
const deactivateInstallation = async (installationId) => {
  try {
    const installation = await Installation.findByInstallationId(installationId);
    
    if (installation) {
      await installation.deactivate();
      
      // Deactivate all repositories for this installation
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

/**
 * Save repository details
 * @param {Object} repo - Repository data from GitHub
 * @param {number} installationId - GitHub installation ID
 */
const saveRepository = async (repo, installationId) => {
  try {
    const installationDoc = await Installation.findByInstallationId(installationId);
    
    if (!installationDoc) {
      logger.warn(`Installation not found: ${installationId}`);
      return;
    }
    
    // Split owner and name from full_name
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
      // Update existing repository
      Object.assign(repoDoc, repoData);
      await repoDoc.save();
    } else {
      // Create new repository
      repoDoc = await Repository.create(repoData);
      
      // Add repository to installation
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

/**
 * Deactivate repository
 * @param {string} fullName - Repository full name (owner/name)
 */
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

/**
 * List repositories for current user
 * @route GET /github/repositories
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listRepositories = asyncHandler(async (req, res) => {
  // Get repositories where the user has access (based on GitHub tokens)
  const user = req.user;
  
  // TODO: Implement repository filtering based on user access
  // For now, return all active repositories
  const repositories = await Repository.find({ isActive: true });
  
  res.json({ repositories });
});

/**
 * Get repository configuration
 * @route GET /github/repositories/:owner/:repo/config
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getRepositoryConfig = asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  
  const repository = await Repository.findByFullName(fullName);
  
  if (!repository) {
    return res.status(404).json({ error: 'Repository not found' });
  }
  
  res.json({ config: repository.configuration });
});

/**
 * Update repository configuration
 * @route PUT /github/repositories/:owner/:repo/config
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateRepositoryConfig = asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  const config = req.body;
  
  const repository = await Repository.findByFullName(fullName);
  
  if (!repository) {
    return res.status(404).json({ error: 'Repository not found' });
  }
  
  // Update configuration
  repository.configuration = {
    ...repository.configuration,
    ...config
  };
  
  await repository.save();
  
  res.json({ config: repository.configuration });
});

module.exports = {
  webhookHandler,
  listRepositories,
  getRepositoryConfig,
  updateRepositoryConfig
};