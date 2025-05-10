const mongoose = require("mongoose");

const PRReviewSchema = new mongoose.Schema({
  reviewId: {
    type: String,
    required: true,
    // Remove unique: true from here since it's in an array
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "failed"],
    default: "pending",
  },
  summary: String,
  feedback: [
    {
      path: String,
      line: Number,
      comment: String,
      type: {
        type: String,
        enum: ["suggestion", "issue", "praise", "question"],
        default: "suggestion",
      },
      severity: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium",
      },
    },
  ],
  metrics: {
    codeQualityScore: Number,
    complexity: Number,
    readability: Number,
    maintainability: Number,
    securityScore: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
  error: String,
});

const PullRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    repositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Repository",
      required: true,
    },
    installationId: {
      type: Number,
      required: true,
    },
    prNumber: {
      type: Number,
      required: true,
    },
    githubPrId: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    author: {
      githubId: String,
      username: String,
      avatarUrl: String,
    },
    state: {
      type: String,
      enum: ["open", "closed", "merged"],
      default: "open",
    },
    url: {
      type: String,
      required: true,
    },
    lastCommitSha: String,
    baseBranch: String,
    headBranch: String,
    closedAt: Date,
    mergedAt: Date,
    labels: [String],
    additions: Number,
    deletions: Number,
    changedFiles: Number,
    reviews: {
      type: [PRReviewSchema],
      default: [], // Explicitly set default to empty array
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
PullRequestSchema.index({ repositoryId: 1, prNumber: 1 }, { unique: true });
PullRequestSchema.index({ userId: 1, state: 1 });
PullRequestSchema.index({ githubPrId: 1 });

// Remove the problematic unique index on nested reviewId
// Instead, we'll ensure uniqueness at the application level

// Instance Methods
PullRequestSchema.methods.addReview = function (reviewData) {
  // Check if review with this ID already exists
  const existingReview = this.reviews.find(
    (r) => r.reviewId === reviewData.reviewId
  );
  if (existingReview) {
    throw new Error(`Review with ID ${reviewData.reviewId} already exists`);
  }

  this.reviews.push(reviewData);
  return this.save();
};

PullRequestSchema.methods.getLatestReview = function () {
  return this.reviews.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
};

PullRequestSchema.methods.updateDetails = function (details) {
  Object.assign(this, details);
  return this.save();
};

// Static Methods
PullRequestSchema.statics.findByRepoAndNumber = function (
  repositoryId,
  prNumber
) {
  return this.findOne({ repositoryId, prNumber });
};

PullRequestSchema.statics.findByUser = function (userId, options = {}) {
  const query = { userId };
  if (options.state) query.state = options.state;
  return this.find(query).sort({ createdAt: -1 });
};

PullRequestSchema.statics.findByRepository = function (
  repositoryId,
  options = {}
) {
  const query = { repositoryId };
  if (options.state) query.state = options.state;
  return this.find(query).sort({ createdAt: -1 });
};

const PullRequest = mongoose.model("PullRequest", PullRequestSchema);

module.exports = PullRequest;
