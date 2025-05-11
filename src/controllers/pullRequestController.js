const pullRequestService = require("../services/pullRequestService");
const { asyncHandler } = require("../middlewares/errorHandler");
const aiReviewService = require("../services/aiReviewService");

const getUserPullRequests = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { state } = req.query;

  const options = {};
  if (state) options.state = state;

  const pullRequests = await pullRequestService.getUserPullRequests(
    userId,
    options
  );

  res.json({ pullRequests });
});

const getRepositoryPullRequests = asyncHandler(async (req, res) => {
  const { repositoryId } = req.params;
  const { state } = req.query;

  const options = {};
  if (state) options.state = state;

  const pullRequests = await pullRequestService.getRepositoryPullRequests(
    repositoryId,
    options
  );

  res.json({ pullRequests });
});

const syncPullRequests = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  try {
    const totalSynced = await pullRequestService.syncAllUserRepositories(
      userId
    );

    res.json({
      success: true,
      message: `Successfully synced ${totalSynced} pull requests`,
      totalSynced,
    });
  } catch (error) {
    logger.error("Error in sync pull requests", {
      error: error.message,
      userId,
    });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to sync pull requests",
    });
  }
});

const syncRepositoryPullRequests = asyncHandler(async (req, res) => {
  const { repositoryId } = req.params;

  const count = await pullRequestService.syncRepositoryPullRequests(
    repositoryId
  );

  res.json({
    success: true,
    message: `Synced ${count} pull requests`,
    count,
  });
});

const triggerReview = asyncHandler(async (req, res) => {
  const { pullRequestId } = req.params;
  const { reReview } = req.body;

  const reviewId = await aiReviewService.reviewPullRequest(
    pullRequestId,
    !!reReview
  );

  res.json({
    success: true,
    reviewId,
    message: reReview
      ? "Re-review triggered successfully"
      : "Review triggered successfully",
  });
});

const getPullRequestDetails = asyncHandler(async (req, res) => {
  const { pullRequestId } = req.params;

  const pullRequest = await pullRequestService.getPullRequestDetails(
    pullRequestId
  );

  res.json({ pullRequest });
});

const getReviewDetails = asyncHandler(async (req, res) => {
  const { pullRequestId, reviewId } = req.params;

  const review = await pullRequestService.getReviewDetails(
    pullRequestId,
    reviewId
  );

  res.json({ review });
});

module.exports = {
  getUserPullRequests,
  getRepositoryPullRequests,
  syncPullRequests,
  syncRepositoryPullRequests,
  triggerReview,
  getPullRequestDetails,
  getReviewDetails,
};
