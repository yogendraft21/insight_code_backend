// services/CreditService.js
const User = require("../models/User");
const CreditPackage = require("../models/CreditPackage");
const Transaction = require("../models/Transaction");
const stripeService = require("./StripeService");

class CreditService {
  async purchaseCredits(userId, packageId, paymentMethodId) {
    try {
      const user = await User.findById(userId);
      const creditPackage = await CreditPackage.findById(packageId);

      if (!user || !creditPackage) {
        throw new Error("User or credit package not found");
      }

      // Create Stripe customer if doesn't exist
      if (!user.subscription?.stripeCustomerId) {
        const customer = await stripeService.createCustomer(user);
        user.subscription = {
          ...user.subscription,
          stripeCustomerId: customer.id,
        };
        await user.save();
      }

      // Create payment intent
      const paymentIntent = await stripeService.createPaymentIntent(
        creditPackage.price,
        user.subscription.stripeCustomerId,
        {
          userId: user._id.toString(),
          packageId: creditPackage._id.toString(),
          credits: creditPackage.credits.toString(),
          type: "credit_purchase",
        }
      );

      // Create pending transaction
      const transaction = await Transaction.create({
        userId: user._id,
        stripePaymentIntentId: paymentIntent.id,
        type: "credit_purchase",
        amount: creditPackage.price,
        status: "pending",
        description: `${creditPackage.credits} Credits Purchase`,
        credits: creditPackage.credits,
      });

      return {
        paymentIntent,
        clientSecret: paymentIntent.client_secret,
        transactionId: transaction._id,
      };
    } catch (error) {
      console.error("Credit purchase error:", error);
      throw error;
    }
  }

  async confirmCreditPurchase(paymentIntentId) {
    try {
      const transaction = await Transaction.findOne({
        stripePaymentIntentId: paymentIntentId,
      });

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      const user = await User.findById(transaction.userId);

      if (!user) {
        throw new Error("User not found");
      }

      // Add credits to user
      await user.addCredits(transaction.credits, "credit_purchase");

      // Update transaction status
      transaction.status = "completed";
      await transaction.save();

      return { success: true, credits: user.getAvailableCredits() };
    } catch (error) {
      console.error("Credit purchase confirmation error:", error);
      throw error;
    }
  }

  async useCredits(userId, amount, reason, metadata = {}) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const remainingCredits = await user.useCredits(amount, reason);

      // Log credit usage
      await Transaction.create({
        userId: user._id,
        type: "credit_usage",
        amount: -amount,
        status: "completed",
        description: reason,
        metadata,
        credits: -amount,
      });

      return { success: true, remainingCredits };
    } catch (error) {
      console.error("Credit usage error:", error);
      throw error;
    }
  }

  async resetMonthlyCredits(userId) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.subscription?.plan) {
        throw new Error("No active subscription found");
      }

      const SubscriptionPlan = require("../models/SubscriptionPlan");
      const plan = await SubscriptionPlan.findOne({
        name: user.subscription.plan,
      });

      if (!plan) {
        throw new Error("Subscription plan not found");
      }

      const remainingCredits = await user.resetMonthlyCredits(plan.credits);

      // Log credit reset
      await Transaction.create({
        userId: user._id,
        type: "credit_reset",
        amount: 0,
        status: "completed",
        description: "Monthly credit reset",
        credits: plan.credits,
      });

      return { success: true, credits: remainingCredits };
    } catch (error) {
      console.error("Credit reset error:", error);
      throw error;
    }
  }

  async getCreditsBalance(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      return {
        total: user.credits.total,
        used: user.credits.used,
        available: user.getAvailableCredits(),
        monthlyAllocation: user.credits.monthlyAllocation,
        lastReset: user.credits.lastReset,
      };
    } catch (error) {
      console.error("Get credits balance error:", error);
      throw error;
    }
  }

  async getCreditHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 10, type } = options;

      const query = {
        userId,
        $or: [
          { type: "credit_purchase" },
          { type: "credit_usage" },
          { type: "credit_reset" },
        ],
      };

      if (type) {
        query.type = type;
      }

      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await Transaction.countDocuments(query);

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Get credit history error:", error);
      throw error;
    }
  }

  async checkCreditAvailability(userId, requiredCredits) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const available = user.getAvailableCredits();

      return {
        available,
        required: requiredCredits,
        sufficient: available >= requiredCredits,
      };
    } catch (error) {
      console.error("Check credit availability error:", error);
      throw error;
    }
  }
}

module.exports = new CreditService();
