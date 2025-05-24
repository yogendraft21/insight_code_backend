// controllers/SubscriptionController.js
const SubscriptionPlan = require("../models/SubscriptionPlan");
const subscriptionService = require("../services/SubscriptionService");
const stripeService = require("../services/StripeService");
const creditService = require("../services/CreditService");
const billingService = require("../services/BillingService");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function getPlans(req, res) {
  try {
    const plans = await SubscriptionPlan.findActive();
    res.json({ success: true, plans });
  } catch (error) {
    console.error("Get plans error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getCurrentSubscription(req, res) {
  try {
    const userId = req.user._id;
    const details = await subscriptionService.getSubscriptionDetails(userId);
    res.json({ success: true, ...details });
  } catch (error) {
    console.error("Get current subscription error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function createSubscription(req, res) {
  try {
    const userId = req.user._id;
    const { planId } = req.body;

    const user = await User.findById(userId);
    const plan = await SubscriptionPlan.findOne({ name: planId });

    if (!user || !plan) {
      return res.status(404).json({ success: false, message: 'User or plan not found' });
    }

    // Create or get customer
    let customerId = user.subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(user);
      customerId = customer.id;
      
      // Save customer ID
      user.subscription = { ...user.subscription, stripeCustomerId: customerId };
      await user.save();
    }

    // Create checkout session instead of subscription
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: plan.stripePriceId,
        quantity: 1,
      }],
      mode: 'subscription',
      customer: customerId,
      success_url: `${process.env.FRONTEND_URL}/dashboard/subscription?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard/subscription?canceled=true`,
      metadata: {
        userId: user._id.toString(),
        planId: plan.name
      }
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function updateSubscription(req, res) {
  try {
    const userId = req.user._id;
    const { planId } = req.body;

    const subscription = await subscriptionService.updateSubscription(
      userId,
      planId
    );

    res.json({ success: true, subscription });
  } catch (error) {
    console.error("Update subscription error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function cancelSubscription(req, res) {
  try {
    const userId = req.user._id;
    const { immediate } = req.body;

    const subscription = await subscriptionService.cancelSubscription(
      userId,
      immediate
    );

    res.json({ success: true, subscription });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function reactivateSubscription(req, res) {
  try {
    const userId = req.user._id;

    const subscription = await subscriptionService.reactivateSubscription(
      userId
    );

    res.json({ success: true, subscription });
  } catch (error) {
    console.error("Reactivate subscription error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function handleWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = await stripeService.constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdate(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}

async function handleSubscriptionUpdate(subscription) {
  // Implementation for subscription update webhook
  const userId = subscription.metadata.userId;
  if (userId) {
    await subscriptionService.syncSubscriptionStatus(userId);
  }
}

async function handleSubscriptionDeleted(subscription) {
  // Implementation for subscription deletion webhook
  const userId = subscription.metadata.userId;
  if (userId) {
    await subscriptionService.cancelSubscription(userId, true);
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  // Implementation for successful payment webhook
  const userId = invoice.subscription_details?.metadata?.userId;
  if (userId) {
    // Reset monthly credits for subscription renewal
    await creditService.resetMonthlyCredits(userId);
  }
}

async function handleInvoicePaymentFailed(invoice) {
  // Implementation for failed payment webhook
  const userId = invoice.subscription_details?.metadata?.userId;
  if (userId) {
    await billingService.handleFailedPayment(userId, invoice.id);
  }
}

async function handlePaymentIntentSucceeded(paymentIntent) {
  // Implementation for successful credit purchase
  if (paymentIntent.metadata.type === "credit_purchase") {
    await creditService.confirmCreditPurchase(paymentIntent.id);
  }
}

async function handleCheckoutSessionCompleted(session) {
  try {
    console.log('Checkout session completed:', session.id);
    
    const userId = session.metadata.userId;
    const planId = session.metadata.planId;
    
    if (!userId || !planId) {
      console.error('Missing userId or planId in checkout session metadata');
      return;
    }

    const user = await User.findById(userId);
    const plan = await SubscriptionPlan.findOne({ name: planId });
    
    if (!user || !plan) {
      console.error('User or plan not found', { userId, planId });
      return;
    }

    // Get the subscription from the session
    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      
      // Update user subscription details
      const subscriptionData = {
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscription.id,
        plan: plan.name,
        status: subscription.status
      };

      // Set dates
      if (subscription.current_period_start) {
        subscriptionData.currentPeriodStart = new Date(subscription.current_period_start * 1000);
      }
      if (subscription.current_period_end) {
        subscriptionData.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      }

      // Save the subscription data
      if (!user.subscription) {
        user.subscription = {};
      }
      Object.assign(user.subscription, subscriptionData);

      // Reset credits for new subscription
      await user.resetMonthlyCredits(plan.credits);
      await user.save();

      // Create transaction record
      await Transaction.create({
        userId: user._id,
        stripeInvoiceId: subscription.latest_invoice,
        type: 'subscription',
        amount: plan.price,
        status: 'completed',
        description: `${plan.displayName} Subscription`,
        planName: plan.name
      });

      console.log('Subscription saved successfully for user:', user.email);
    }
  } catch (error) {
    console.error('Error handling checkout session completed:', error);
  }
}

module.exports = {
  getPlans,
  getCurrentSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription,
  handleWebhook,
};
