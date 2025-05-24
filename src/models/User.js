// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    lastLogin: {
      type: Date,
    },
    // Subscription fields
    subscription: {
      status: {
        type: String,
        enum: [
          "active",
          "trialing",
          "past_due",
          "canceled",
          "unpaid",
          "incomplete",
          "incomplete_expired",
        ],
        default: null,
      },
      plan: {
        type: String,
        enum: ["starter", "pro", "enterprise"],
        default: null,
      },
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      currentPeriodStart: Date,
      currentPeriodEnd: Date,
      cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
      },
      trialEnd: Date,
      defaultPaymentMethodId: String,
    },
    // Credit system
    credits: {
      total: { type: Number, default: 0 },
      used: { type: Number, default: 0 },
      monthlyAllocation: { type: Number, default: 0 },
      lastReset: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        return ret;
      },
    },
  }
);

// Existing methods
UserSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

UserSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    const user = await mongoose
      .model("User")
      .findById(this._id)
      .select("+password");
    if (!user || !user.password) return false;
    return await bcrypt.compare(candidatePassword, user.password);
  } catch (error) {
    return false;
  }
};

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.updateRefreshToken = async function (token) {
  this.refreshToken = token;
  return this.save();
};

// New subscription methods
UserSchema.methods.hasActiveSubscription = function () {
  return (
    this.subscription?.status === "active" ||
    this.subscription?.status === "trialing"
  );
};

UserSchema.methods.getAvailableCredits = function () {
  return this.credits.total - this.credits.used;
};

UserSchema.methods.useCredits = async function (amount, reason) {
  const available = this.getAvailableCredits();
  if (available < amount) {
    throw new Error("Insufficient credits");
  }

  this.credits.used += amount;
  await this.save();

  return this.getAvailableCredits();
};

UserSchema.methods.addCredits = async function (amount, reason) {
  this.credits.total += amount;
  await this.save();

  return this.getAvailableCredits();
};

UserSchema.methods.resetMonthlyCredits = async function (credits) {
  this.credits.total = credits;
  this.credits.used = 0;
  this.credits.monthlyAllocation = credits;
  this.credits.lastReset = new Date();

  await this.save();

  return this.getAvailableCredits();
};

const User = mongoose.model("User", UserSchema);
module.exports = User;
