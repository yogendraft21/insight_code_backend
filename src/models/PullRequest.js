const mongoose = require('mongoose');

const PRReviewSchema = new mongoose.Schema({
  reviewId: {
    type: String,
    required: true,
    unique: true
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
  timestamps: true // this manages createdAt and updatedAt automatically
});

// Compound index for repositoryId + prNumber
PullRequestSchema.index({ repositoryId: 1, prNumber: 1 }, { unique: true });

// === Instance Methods ===

PullRequestSchema.methods.addReview = function(reviewData) {
  this.reviews.push(reviewData);
  return this.save();
};

PullRequestSchema.methods.getLatestReview = function() {
  return this.reviews.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
};

PullRequestSchema.methods.updateDetails = function(details) {
  Object.assign(this, details);
  return this.save();
};

// === Static Methods ===

PullRequestSchema.statics.findByRepoAndNumber = function(repositoryId, prNumber) {
  return this.findOne({ repositoryId, prNumber });
};

const PullRequest = mongoose.model('PullRequest', PullRequestSchema);

module.exports = PullRequest;
