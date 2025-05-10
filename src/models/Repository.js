/**
 * Repository model
 * Stores information about repositories connected to the system
 */
const mongoose = require('mongoose');

const RepositorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  owner: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true,
    unique: true
  },
  githubId: {
    type: Number,
    required: true,
    unique: true
  },
  installationId: {
    type: Number,
    required: true
  },
  configuration: {
    autoReview: {
      type: Boolean,
      default: true
    },
    reviewThreshold: {
      type: Number,
      default: 2
    },
    notifyOnOpen: {
      type: Boolean,
      default: true
    },
    notifyOnUpdate: {
      type: Boolean,
      default: true
    },
    codeOwners: [String],
    excludedPaths: [String],
    includedPaths: [String]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  stats: {
    totalPRs: {
      type: Number,
      default: 0
    },
    totalReviews: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create compound index for owner and name
RepositorySchema.index({ owner: 1, name: 1 }, { unique: true });

// Virtual for repository URL
RepositorySchema.virtual('url').get(function () {
  return `https://github.com/${this.fullName}`;
});

// Find repository by full name
RepositorySchema.statics.findByFullName = function (fullName) {
  return this.findOne({ fullName });
};

// Update repository stats when a PR is opened
RepositorySchema.methods.incrementPRCount = function () {
  this.stats.totalPRs += 1;
  this.stats.lastActivity = Date.now();
  return this.save();
};

// Update repository stats when a review is added
RepositorySchema.methods.incrementReviewCount = function () {
  this.stats.totalReviews += 1;
  this.stats.lastActivity = Date.now();
  return this.save();
};

const Repository = mongoose.model('Repository', RepositorySchema);
module.exports = Repository;