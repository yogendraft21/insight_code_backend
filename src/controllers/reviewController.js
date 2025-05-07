/**
 * Review Controller
 * Handles AI code review operations
 */
const Repository = require('../models/Repository');
const PullRequest = require('../models/PullRequest');
const githubService = require('../services/githubService');
const aiReviewService = require('../services/aiReviewService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middlewares/errorHandler');

/**
 * Trigger AI review for a pull request
 * @route POST /review/trigger
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const manualTriggerReview = asyncHandler(async (req, res) => {
  const { owner, repo, prNumber } = req.body;
  
  if (!owner || !repo || !prNumber) {
    return res.status(400).json({ error: 'Owner, repo and PR number are required' });
  }
  
  // Find repository
  const repository = await Repository.findByFullName(`${owner}/${repo}`);
  
  if (!repository) {
    return res.status(404).json({ error: 'Repository not found' });
  }
  
  // Trigger review (don't await to avoid blocking response)
  const reviewId = await triggerReview(repository.installationId, owner, repo, prNumber);
  
  res.json({ 
    message: 'Review triggered successfully',
    reviewId
  });
});

/**
 * Trigger AI review process
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} prNumber - Pull request number
 * @returns {string} Review ID
 */
const triggerReview = async (installationId, owner, repo, prNumber) => {
  try {
    // Create unique review ID
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Get repository from database
    const repository = await Repository.findByFullName(`${owner}/${repo}`);
    
    if (!repository) {
      throw new Error(`Repository not found: ${owner}/${repo}`);
    }
    
    // Get PR details from GitHub
    const prDetails = await githubService.getPullRequest(installationId, owner, repo, prNumber);
    
    // Get or create PR record in database
    let pr = await PullRequest.findByRepoAndNumber(repository._id, prNumber);
    
    if (!pr) {
      // Create new PR record
      pr = await PullRequest.create({
        repositoryId: repository._id,
        prNumber,
        title: prDetails.title,
        description: prDetails.body,
        author: {
          githubId: prDetails.user.id.toString(),
          username: prDetails.user.login,
          avatarUrl: prDetails.user.avatar_url
        },
        state: prDetails.state,
        url: prDetails.html_url,
        lastCommitSha: prDetails.head.sha,
        createdAt: new Date(prDetails.created_at),
        updatedAt: new Date(prDetails.updated_at),
        additions: prDetails.additions,
        deletions: prDetails.deletions,
        changedFiles: prDetails.changed_files,
        labels: prDetails.labels.map(label => label.name)
      });
      
      // Update repository stats
      await repository.incrementPRCount();
    }
    
    // Create review record
    const review = {
      reviewId,
      status: 'in_progress'
    };
    
    // Add review to PR
    await pr.addReview(review);
    
    // Schedule async review process
    process.nextTick(async () => {
      try {
        // Do the actual review
        await performReview(installationId, owner, repo, prNumber, reviewId);
      } catch (error) {
        logger.error('Error during review process', { 
          error: error.message,
          owner,
          repo,
          prNumber
        });
        
        // Update review status to failed
        await updateReviewStatus(repository._id, prNumber, reviewId, 'failed', { error: error.message });
        
        // Send notification about failed review
        await notificationService.send({
          type: 'review_failed',
          data: {
            title: pr.title,
            repository: `${owner}/${repo}`,
            url: pr.url,
            error: error.message
          }
        });
      }
    });
    
    return reviewId;
  } catch (error) {
    logger.error('Error triggering review', { 
      error: error.message,
      owner,
      repo,
      prNumber
    });
    throw error;
  }
};

/**
 * Perform AI review on a pull request
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} prNumber - Pull request number
 * @param {string} reviewId - Unique review ID
 */
const performReview = async (installationId, owner, repo, prNumber, reviewId) => {
  try {
    logger.info('Starting AI review', { owner, repo, prNumber, reviewId });
    
    // Get PR details from GitHub
    const prDetails = await githubService.getPullRequest(installationId, owner, repo, prNumber);
    const prFiles = await githubService.getPullRequestFiles(installationId, owner, repo, prNumber);
    
    // Get repository config
    const repository = await Repository.findByFullName(`${owner}/${repo}`);
    const config = repository.configuration;
    
    // Filter files based on configuration
    let filesToReview = prFiles;
    
    if (config.excludedPaths && config.excludedPaths.length > 0) {
      // Exclude files matching patterns
      filesToReview = filesToReview.filter(file => {
        return !config.excludedPaths.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(file.filename);
        });
      });
    }
    
    if (config.includedPaths && config.includedPaths.length > 0) {
      // Only include files matching patterns
      filesToReview = filesToReview.filter(file => {
        return config.includedPaths.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(file.filename);
        });
      });
    }
    
    // Skip review if no files to review
    if (filesToReview.length === 0) {
      await updateReviewStatus(repository._id, prNumber, reviewId, 'completed', {
        summary: 'No files to review based on configuration.',
        feedback: []
      });
      return;
    }
    
    // Get file contents and prepare for AI service
    const filesForAI = [];
    
    for (const file of filesToReview) {
      try {
        // Skip binary files and deleted files
        if (file.status === 'removed' || file.binary) {
          continue;
        }
        
        // Get file content
        const content = await githubService.getFileContent(
          installationId,
          owner,
          repo,
          file.filename,
          prDetails.head.sha
        );
        
        filesForAI.push({
          path: file.filename,
          content,
          diff: file.patch
        });
      } catch (error) {
        logger.warn(`Could not get content for file: ${file.filename}`, { 
          error: error.message 
        });
      }
    }
    
    // Generate AI review
    const reviewResult = await aiReviewService.reviewCode(
      filesForAI,
      prDetails.title,
      prDetails.body
    );
    
    // Update review status
    await updateReviewStatus(repository._id, prNumber, reviewId, 'completed', reviewResult);
    
    // Post review to GitHub
    if (reviewResult.feedback && reviewResult.feedback.length > 0) {
      await githubService.createReview(
        installationId,
        owner,
        repo,
        prNumber,
        reviewResult.feedback,
        prDetails.head.sha
      );
    }
    
    // Post summary comment
    await githubService.addComment(
      installationId,
      owner,
      repo,
      prNumber,
      `## AI Review Summary\n\n${reviewResult.summary}\n\n---\n*Generated by PR AI Reviewer*`
    );
    
    // Update repository stats
    await repository.incrementReviewCount();
    
    // Send notification
    await notificationService.send({
      type: 'review_completed',
      data: {
        title: prDetails.title,
        repository: `${owner}/${repo}`,
        url: prDetails.html_url,
        summary: reviewResult.summary,
        issueCount: reviewResult.feedback.filter(f => f.type === 'issue').length,
        suggestionCount: reviewResult.feedback.filter(f => f.type === 'suggestion').length
      }
    });
    
    logger.info('AI review completed successfully', { owner, repo, prNumber, reviewId });
  } catch (error) {
    logger.error('Error during review process', { 
      error: error.message,
      owner,
      repo,
      prNumber
    });
    throw error;
  }
};

/**
 * Update review status in database
 * @param {string} repositoryId - Repository ID
 * @param {number} prNumber - Pull request number
 * @param {string} reviewId - Review ID
 * @param {string} status - New status
 * @param {Object} data - Additional data to update
 */
const updateReviewStatus = async (repositoryId, prNumber, reviewId, status, data = {}) => {
  try {
    const pr = await PullRequest.findByRepoAndNumber(repositoryId, prNumber);
    
    if (!pr) {
      throw new Error(`Pull request not found: ${prNumber}`);
    }
    
    const reviewIndex = pr.reviews.findIndex(r => r.reviewId === reviewId);
    
    if (reviewIndex === -1) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    // Update review
    pr.reviews[reviewIndex].status = status;
    
    if (status === 'completed') {
      pr.reviews[reviewIndex].completedAt = new Date();
      pr.reviews[reviewIndex].summary = data.summary;
      pr.reviews[reviewIndex].feedback = data.feedback;
      pr.reviews[reviewIndex].metrics = data.metrics;
    } else if (status === 'failed') {
      pr.reviews[reviewIndex].error = data.error;
    }
    
    await pr.save();
  } catch (error) {
    logger.error('Error updating review status', { 
      error: error.message,
      repositoryId,
      prNumber,
      reviewId
    });
    throw error;
  }
};

/**
 * Get review status
 * @route GET /review/status/:reviewId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getReviewStatus = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  
  // Find PR with the given review ID
  const pr = await PullRequest.findOne({ 'reviews.reviewId': reviewId });
  
  if (!pr) {
    return res.status(404).json({ error: 'Review not found' });
  }
  
  // Find the specific review
  const review = pr.reviews.find(r => r.reviewId === reviewId);
  
  if (!review) {
    return res.status(404).json({ error: 'Review not found' });
  }
  
  // Return review status
  res.json({
    status: review.status,
    summary: review.summary,
    feedback: review.feedback,
    metrics: review.metrics,
    createdAt: review.createdAt,
    completedAt: review.completedAt,
    error: review.error
  });
});

/**
 * List reviews for a pull request
 * @route GET /review/list/:owner/:repo/:prNumber
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listReviews = asyncHandler(async (req, res) => {
  const { owner, repo, prNumber } = req.params;
  
  // Find repository
  const repository = await Repository.findByFullName(`${owner}/${repo}`);
  
  if (!repository) {
    return res.status(404).json({ error: 'Repository not found' });
  }
  
  // Find PR
  const pr = await PullRequest.findByRepoAndNumber(repository._id, parseInt(prNumber));
  
  if (!pr) {
    return res.status(404).json({ error: 'Pull request not found' });
  }
  
  // Return all reviews
  res.json({ reviews: pr.reviews });
});

module.exports = {
  manualTriggerReview,
  getReviewStatus,
  listReviews,
  triggerReview
};