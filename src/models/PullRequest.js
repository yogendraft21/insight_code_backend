/**
 * PullRequest model
 * Stores information about pull requests and their review status
 */
const mongoose = require('mongoose');

const PRReviewSchema = new mongoose.Schema({
  reviewId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending'
  },
  summary: String,
  feedback: [
    {
      path: String,
      line: Number,
      comment: String,
      type: {
        type: String,
        enum: ['suggestion', 'issue', 'praise', 'question'],
        default: 'suggestion'
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      }
    }
  ],
  metrics: {
    codeQualityScore: Number,
    complexity: Number,
    readability: Number,
    maintainability: Number,
    securityScore: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  error: String
});

const PullRequestSchema = new mongoose.Schema({
  repositoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository',
    required: true
  },
  prNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  author: {
    githubId: String,
    username: String,
    avatarUrl: String
  },
  state: {
    type: String,
    enum: ['open', 'closed', 'merged'],
    default: 'open'
  },
  url: {
    type: String,
    required: true
  },
  lastCommitSha: String,
  createdAt: {
    type: Date,
    required: true
  },
  updatedAt: {
    type: Date,
    required: true
  },
  closedAt: Date,
  mergedAt: Date,
  labels: [String],
  additions: Number,
  deletions: Number,
  changedFiles: Number,
  reviews: [PRReviewSchema],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound index for repository and PR number
PullRequestSchema.index({ repositoryId: 1, prNumber: 1 }, { unique: true });

// Add a new review
PullRequestSchema.methods.addReview = function(reviewData) {
  this.reviews.push(reviewData);
  return this.save();
};

// Get the latest review
PullRequestSchema.methods.getLatestReview = function() {
  if (this.reviews.length === 0) return null;
  return this.reviews.sort((a, b) => b.createdAt - a.createdAt)[0];
};

// Update pull request details
PullRequestSchema.methods.updateDetails = function(details) {
  Object.assign(this, details);
  this.updatedAt = Date.now();
  return this.save();
};

// Find by repository and PR number
PullRequestSchema.statics.findByRepoAndNumber = function(repositoryId, prNumber) {
  return this.findOne({ repositoryId, prNumber });
};

const PullRequest = mongoose.model('PullRequest', PullRequestSchema);

module.exports = PullRequest;