/**
 * Installation model
 * Stores information about GitHub app installations
 */
const mongoose = require('mongoose');

const InstallationSchema = new mongoose.Schema({
  installationId: {
    type: Number,
    required: true,
    unique: true
  },
  accountId: {
    type: Number,
    required: true
  },
  accountLogin: {
    type: String,
    required: true
  },
  accountType: {
    type: String,
    enum: ['Organization', 'User'],
    required: true
  },
  repositories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository'
  }],
  permissions: {
    type: Map,
    of: String
  },
  events: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Find installation by GitHub installation ID
InstallationSchema.statics.findByInstallationId = function(installationId) {
  return this.findOne({ installationId });
};

// Add repository to installation
InstallationSchema.methods.addRepository = function(repositoryId) {
  if (!this.repositories.includes(repositoryId)) {
    this.repositories.push(repositoryId);
    this.updatedAt = Date.now();
    return this.save();
  }
  return this;
};

// Remove repository from installation
InstallationSchema.methods.removeRepository = function(repositoryId) {
  this.repositories = this.repositories.filter(
    repo => !repo.equals(repositoryId)
  );
  this.updatedAt = Date.now();
  return this.save();
};

// Update installation details
InstallationSchema.methods.updateDetails = function(details) {
  Object.assign(this, details);
  this.updatedAt = Date.now();
  return this.save();
};

// Deactivate installation
InstallationSchema.methods.deactivate = function() {
  this.isActive = false;
  this.updatedAt = Date.now();
  return this.save();
};

const Installation = mongoose.model('Installation', InstallationSchema);

module.exports = Installation;