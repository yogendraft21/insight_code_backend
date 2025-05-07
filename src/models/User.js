/**
 * User model
 * Stores user information and GitHub credentials
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  githubId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String
  },
  avatarUrl: String,
  name: String,
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  notificationPreferences: {
    email: {
      enabled: { type: Boolean, default: true },
      address: String
    },
    slack: {
      enabled: { type: Boolean, default: false },
      webhook: String
    }
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.accessToken;
      delete ret.refreshToken;
      return ret;
    }
  }
});

// Update last login timestamp
UserSchema.methods.updateLoginTimestamp = function() {
  this.lastLogin = Date.now();
  return this.save();
};

// Find user by GitHub ID
UserSchema.statics.findByGithubId = function(githubId) {
  return this.findOne({ githubId });
};

// Update user tokens
UserSchema.methods.updateTokens = function(accessToken, refreshToken) {
  this.accessToken = accessToken;
  if (refreshToken) {
    this.refreshToken = refreshToken;
  }
  return this.save();
};

const User = mongoose.model('User', UserSchema);

module.exports = User;