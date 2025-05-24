// services/SubscriptionService.js
const User = require("../models/User");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const Transaction = require("../models/Transaction");
const stripeService = require("./StripeService");

class SubscriptionService {
  async createSubscription(userId, planId, paymentMethodId) {
    try {
      const user = await User.findById(userId);
      const plan = await SubscriptionPlan.findOne({ name: planId });
      
      if (!user || !plan) {
        throw new Error('User or plan not found');
      }
  
      console.log('Creating subscription for user:', user.email, 'Plan:', plan.name);
  
      // Create Stripe customer if doesn't exist
      if (!user.subscription?.stripeCustomerId) {
        const customer = await stripeService.createCustomer(user);
        user.subscription = {
          ...user.subscription,
          stripeCustomerId: customer.id
        };
        await user.save();
      }
  
      // Attach payment method if provided
      if (paymentMethodId) {
        await stripeService.attachPaymentMethod(
          user.subscription.stripeCustomerId,
          paymentMethodId
        );
      }
  
      // Create subscription
      const result = await stripeService.createSubscription(
        user.subscription.stripeCustomerId,
        plan.stripePriceId,
        {
          metadata: {
            userId: user._id.toString(),
            planId: plan.name
          }
        }
      );
  
      // Check if setup is required
      if (result.requiresSetup) {
        // Just return the setup intent without processing further
        return {
          requiresSetup: true,
          setupSecret: result.setupSecret
        };
      }
  
      // Process normal subscription
      const subscription = result.subscription;
      const clientSecret = result.clientSecret;
  
      console.log('Stripe subscription created:', subscription.id, 'Status:', subscription.status);
  
      // Update user subscription details
      const subscriptionData = {
        stripeCustomerId: user.subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        plan: plan.name,
        status: subscription.status
      };
  
      // Only set dates if they exist and are valid
      if (subscription.current_period_start) {
        subscriptionData.currentPeriodStart = new Date(subscription.current_period_start * 1000);
      }
      if (subscription.current_period_end) {
        subscriptionData.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      }
  
      user.subscription = subscriptionData;
  
      // Reset credits for new subscription
      await user.resetMonthlyCredits(plan.credits);
      await user.save();
  
      // Create transaction record
      await Transaction.create({
        userId: user._id,
        stripeInvoiceId: subscription.latest_invoice,
        type: 'subscription',
        amount: plan.price,
        status: subscription.status === 'active' ? 'completed' : 'pending',
        description: `${plan.displayName} Subscription`,
        planName: plan.name
      });
  
      // Return the subscription and clientSecret
      return {
        subscription,
        clientSecret
      };
    } catch (error) {
      console.error('Subscription creation error:', error);
      throw error;
    }
  }

  async updateSubscription(userId, newPlanId) {
    try {
      const user = await User.findById(userId);
      const newPlan = await SubscriptionPlan.findOne({ name: newPlanId });

      if (!user || !newPlan) {
        throw new Error("User or plan not found");
      }

      if (!user.subscription?.stripeSubscriptionId) {
        throw new Error("No active subscription found");
      }

      const updatedSubscription = await stripeService.updateSubscription(
        user.subscription.stripeSubscriptionId,
        newPlan.stripePriceId
      );

      // Update user subscription details
      user.subscription.plan = newPlan.name;
      user.subscription.status = updatedSubscription.status;

      // Adjust credits based on plan change
      if (newPlan.credits !== user.credits.monthlyAllocation) {
        const creditDifference =
          newPlan.credits - user.credits.monthlyAllocation;
        user.credits.total += creditDifference;
        user.credits.monthlyAllocation = newPlan.credits;
      }

      await user.save();

      // Create transaction record
      await Transaction.create({
        userId: user._id,
        type: "subscription",
        amount: newPlan.price,
        status: "completed",
        description: `Upgrade to ${newPlan.displayName} Plan`,
        planName: newPlan.name,
      });

      return updatedSubscription;
    } catch (error) {
      console.error("Subscription update error:", error);
      throw error;
    }
  }

  async cancelSubscription(userId, immediate = false) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.subscription?.stripeSubscriptionId) {
        throw new Error("No active subscription found");
      }

      const canceledSubscription = await stripeService.cancelSubscription(
        user.subscription.stripeSubscriptionId,
        immediate
      );

      // Update user subscription status
      user.subscription.status = canceledSubscription.status;
      user.subscription.cancelAtPeriodEnd =
        canceledSubscription.cancel_at_period_end;

      if (immediate) {
        user.subscription.plan = null;
        user.credits.monthlyAllocation = 0;
      }

      await user.save();

      return canceledSubscription;
    } catch (error) {
      console.error("Subscription cancellation error:", error);
      throw error;
    }
  }

  async reactivateSubscription(userId) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.subscription?.stripeSubscriptionId) {
        throw new Error("No subscription found");
      }

      if (!user.subscription.cancelAtPeriodEnd) {
        throw new Error("Subscription is not scheduled for cancellation");
      }

      const reactivatedSubscription = await stripeService.updateSubscription(
        user.subscription.stripeSubscriptionId,
        { cancel_at_period_end: false }
      );

      user.subscription.cancelAtPeriodEnd = false;
      user.subscription.status = reactivatedSubscription.status;
      await user.save();

      return reactivatedSubscription;
    } catch (error) {
      console.error("Subscription reactivation error:", error);
      throw error;
    }
  }

  async syncSubscriptionStatus(userId) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.subscription?.stripeSubscriptionId) {
        return null;
      }

      const subscription = await stripeService.getSubscription(
        user.subscription.stripeSubscriptionId
      );

      user.subscription.status = subscription.status;
      if (subscription.current_period_start) {
        user.subscription.currentPeriodStart = new Date(
          subscription.current_period_start * 1000
        );
      }
      if (subscription.current_period_end) {
        user.subscription.currentPeriodEnd = new Date(
          subscription.current_period_end * 1000
        );
      }

      await user.save();

      return subscription;
    } catch (error) {
      console.error("Subscription sync error:", error);
      throw error;
    }
  }

  async getSubscriptionDetails(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const currentPlan = user.subscription?.plan
        ? await SubscriptionPlan.findOne({ name: user.subscription.plan })
        : null;

      return {
        subscription: user.subscription,
        credits: user.credits,
        currentPlan: currentPlan
          ? {
              name: currentPlan.name,
              displayName: currentPlan.displayName,
              price: currentPlan.price,
              credits: currentPlan.credits,
              features: currentPlan.features,
            }
          : null,
      };
    } catch (error) {
      console.error("Get subscription details error:", error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();
