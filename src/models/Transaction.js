// models/Transaction.js
const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stripePaymentIntentId: String,
    stripeInvoiceId: String,
    stripeChargeId: String,
    type: {
      type: String,
      enum: [
        "subscription",
        "credit_purchase",
        "refund",
        "subscription_renewal",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    description: String,
    metadata: {
      type: Map,
      of: String,
    },
    credits: Number, // For credit purchases
    planName: String, // For subscriptions
    invoiceUrl: String,
    receiptUrl: String,
    failureCode: String,
    failureMessage: String,
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ stripePaymentIntentId: 1 });
TransactionSchema.index({ stripeInvoiceId: 1 });

TransactionSchema.statics.findByUser = function (userId, options = {}) {
  const query = this.find({ userId });

  if (options.type) {
    query.where("type").equals(options.type);
  }

  if (options.status) {
    query.where("status").equals(options.status);
  }

  return query.sort({ createdAt: -1 });
};

const Transaction = mongoose.model("Transaction", TransactionSchema);
module.exports = Transaction;
