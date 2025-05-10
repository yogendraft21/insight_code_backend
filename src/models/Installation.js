const mongoose = require("mongoose");

const InstallationSchema = new mongoose.Schema(
  {
    installationId: {
      type: Number,
      sparse: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    state: {
      type: String,
      required: true,
      unique: true,
    },
    githubUsername: {
      type: String,
      sparse: true,
    },
    githubUserId: {
      type: Number,
      sparse: true,
    },
    status: {
      type: String,
      enum: ["pending", "verified", "active", "inactive"],
      default: "pending",
      required: true,
    },
    accountId: {
      type: Number,
      sparse: true,
    },
    accountLogin: {
      type: String,
      sparse: true,
    },
    accountType: {
      type: String,
      enum: ["Organization", "User"],
      sparse: true,
    },
    repositories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Repository",
      },
    ],
    permissions: {
      type: Map,
      of: String,
    },
    events: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
    verifiedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      expires: "15m",
      default: function () {
        return this.status === "pending"
          ? new Date(Date.now() + 15 * 60 * 1000)
          : undefined;
      },
    },
  },
  {
    timestamps: true,
  }
);

InstallationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: "pending" },
  }
);

// Indexes
InstallationSchema.index({ userId: 1, status: 1 });
InstallationSchema.index({ state: 1, expiresAt: 1 });
InstallationSchema.index({ githubUsername: 1, status: 1 });

// Static Methods
InstallationSchema.statics.findByInstallationId = function (installationId) {
  return this.findOne({ installationId });
};

InstallationSchema.statics.findByState = function (state) {
  return this.findOne({ state, expiresAt: { $gt: new Date() } });
};

InstallationSchema.statics.findPendingByUser = function (userId) {
  return this.findOne({
    userId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
};

InstallationSchema.statics.findVerifiedByInstallationId = function (
  installationId
) {
  return this.findOne({
    installationId,
    status: "verified",
  });
};

InstallationSchema.statics.createPendingInstallation = async function (
  userId,
  state,
  expiresIn = 15
) {
  return this.create({
    userId,
    state,
    status: "pending",
    expiresAt: new Date(Date.now() + expiresIn * 60 * 1000),
  });
};

// Instance Methods
InstallationSchema.methods.verify = async function (installationId) {
  this.installationId = installationId;
  this.status = "verified";
  this.verifiedAt = new Date();
  return await this.save();
};

InstallationSchema.methods.activate = async function (githubData) {
  Object.assign(this, {
    accountId: githubData.accountId,
    accountLogin: githubData.accountLogin,
    accountType: githubData.accountType,
    permissions: githubData.permissions,
    events: githubData.events,
    status: "active",
    isActive: true,
  });
  return await this.save();
};

InstallationSchema.methods.addRepository = async function (repositoryId) {
  if (!this.repositories.some((repo) => repo.equals(repositoryId))) {
    this.repositories.push(repositoryId);
    return await this.save();
  }
  return this;
};

InstallationSchema.methods.removeRepository = async function (repositoryId) {
  this.repositories = this.repositories.filter(
    (repo) => !repo.equals(repositoryId)
  );
  return await this.save();
};

InstallationSchema.methods.updateDetails = async function (details) {
  Object.assign(this, details);
  return await this.save();
};

InstallationSchema.methods.deactivate = async function () {
  this.isActive = false;
  this.status = "inactive";
  return await this.save();
};

const Installation = mongoose.model("Installation", InstallationSchema);

module.exports = Installation;
