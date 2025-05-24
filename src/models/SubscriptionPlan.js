// models/SubscriptionPlan.js
const mongoose = require("mongoose");

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ["starter", "pro", "enterprise"],
    },
    displayName: {
      type: String,
      required: true,
    },
    stripeProductId: {
      type: String,
      required: true,
    },
    stripePriceId: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    interval: {
      type: String,
      enum: ["month", "year"],
      default: "month",
    },
    credits: {
      type: Number,
      required: true,
    },
    features: [String],
    limits: {
      repositories: Number,
      apiRequests: Number,
      teamMembers: Number,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    recommended: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

SubscriptionPlanSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

SubscriptionPlanSchema.statics.findByStripePriceId = function (priceId) {
  return this.findOne({ stripePriceId: priceId });
};

const SubscriptionPlan = mongoose.model(
  "SubscriptionPlan",
  SubscriptionPlanSchema
);
module.exports = SubscriptionPlan;
