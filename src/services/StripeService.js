// services/StripeService.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

class StripeService {
  async createCustomer(user) {
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString(),
        },
      });

      return customer;
    } catch (error) {
      console.error("Stripe customer creation error:", error);
      throw new Error("Failed to create customer");
    }
  }

  async createSubscription(customerId, priceId, options = {}) {
    try {
      console.log('Creating subscription for customer:', customerId, 'price:', priceId);
      
      // Check if customer has a default payment method
      const customer = await stripe.customers.retrieve(customerId);
      console.log('Customer has default payment method:', !!customer.invoice_settings?.default_payment_method);
      
      if (!customer.invoice_settings?.default_payment_method) {
        console.log('No payment method found, creating setup intent...');
        
        // Create a setup intent for adding a payment method
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          usage: 'off_session',
          automatic_payment_methods: {
            enabled: true
          }
        });
        
        return {
          requiresSetup: true,
          setupSecret: setupIntent.client_secret
        };
      }
      
      // If payment method exists, create the subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: options.metadata || {}
      });
  
      let clientSecret = null;
      
      if (subscription.latest_invoice?.payment_intent?.client_secret) {
        clientSecret = subscription.latest_invoice.payment_intent.client_secret;
      } else if (subscription.status === 'incomplete' && subscription.latest_invoice) {
        // Fallback to manual retrieval
        const invoiceId = typeof subscription.latest_invoice === 'string' 
          ? subscription.latest_invoice 
          : subscription.latest_invoice.id;
  
        const invoice = await stripe.invoices.retrieve(invoiceId);
        
        if (invoice.payment_intent) {
          const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
          clientSecret = paymentIntent.client_secret;
        }
      }
  
      return {
        subscription,
        clientSecret
      };
    } catch (error) {
      console.error("Stripe subscription creation error:", error);
      throw new Error("Failed to create subscription");
    }
  }

  async getSubscription(subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error("Stripe get subscription error:", error);
      throw new Error("Failed to get subscription");
    }
  }

  async updateSubscription(subscriptionId, newPriceId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const updatedSubscription = await stripe.subscriptions.update(
        subscriptionId,
        {
          items: [
            {
              id: subscription.items.data[0].id,
              price: newPriceId,
            },
          ],
          proration_behavior: "create_prorations",
        }
      );

      return updatedSubscription;
    } catch (error) {
      console.error("Stripe subscription update error:", error);
      throw new Error("Failed to update subscription");
    }
  }

  async cancelSubscription(subscriptionId, immediate = false) {
    try {
      if (immediate) {
        const subscription = await stripe.subscriptions.cancel(subscriptionId);
        return subscription;
      } else {
        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
        return subscription;
      }
    } catch (error) {
      console.error("Stripe subscription cancellation error:", error);
      throw new Error("Failed to cancel subscription");
    }
  }

  async createPaymentIntent(amount, customerId, metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata,
      });

      return paymentIntent;
    } catch (error) {
      console.error("Stripe payment intent creation error:", error);
      throw new Error("Failed to create payment intent");
    }
  }

  async attachPaymentMethod(customerId, paymentMethodId) {
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      return true;
    } catch (error) {
      console.error("Stripe payment method attachment error:", error);
      throw new Error("Failed to attach payment method");
    }
  }

  async listPaymentMethods(customerId) {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });

      return paymentMethods.data;
    } catch (error) {
      console.error("Stripe list payment methods error:", error);
      throw new Error("Failed to list payment methods");
    }
  }

  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    try {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      return true;
    } catch (error) {
      console.error("Stripe set default payment method error:", error);
      throw new Error("Failed to set default payment method");
    }
  }

  async listInvoices(customerId, limit = 10) {
    try {
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data;
    } catch (error) {
      console.error("Stripe invoices listing error:", error);
      throw new Error("Failed to list invoices");
    }
  }

  async constructWebhookEvent(payload, signature) {
    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      throw new Error("Invalid webhook signature");
    }
  }
}

module.exports = new StripeService();
