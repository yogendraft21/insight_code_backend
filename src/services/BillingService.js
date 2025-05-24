// services/BillingService.js
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const stripeService = require("./StripeService");

class BillingService {
  async getTransactionHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 10, type, status } = options;

      const query = { userId };

      if (type) {
        query.type = type;
      }

      if (status) {
        query.status = status;
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
      console.error("Get transaction history error:", error);
      throw error;
    }
  }

  async getInvoices(userId, limit = 10) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.subscription?.stripeCustomerId) {
        return [];
      }

      const invoices = await stripeService.listInvoices(
        user.subscription.stripeCustomerId,
        limit
      );

      return invoices.map((invoice) => ({
        id: invoice.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status,
        created: new Date(invoice.created * 1000),
        description: invoice.description,
        invoiceUrl: invoice.hosted_invoice_url,
        pdfUrl: invoice.invoice_pdf,
      }));
    } catch (error) {
      console.error("Get invoices error:", error);
      throw error;
    }
  }

  async getPaymentMethods(userId) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.subscription?.stripeCustomerId) {
        return [];
      }

      const paymentMethods = await stripeService.listPaymentMethods(
        user.subscription.stripeCustomerId
      );

      return paymentMethods.map((pm) => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        isDefault: pm.id === user.subscription.defaultPaymentMethodId,
      }));
    } catch (error) {
      console.error("Get payment methods error:", error);
      throw error;
    }
  }

  async addPaymentMethod(userId, paymentMethodId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error("User not found");
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

      await stripeService.attachPaymentMethod(
        user.subscription.stripeCustomerId,
        paymentMethodId
      );

      return { success: true };
    } catch (error) {
      console.error("Add payment method error:", error);
      throw error;
    }
  }

  async setDefaultPaymentMethod(userId, paymentMethodId) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.subscription?.stripeCustomerId) {
        throw new Error("User or subscription not found");
      }

      await stripeService.setDefaultPaymentMethod(
        user.subscription.stripeCustomerId,
        paymentMethodId
      );

      user.subscription.defaultPaymentMethodId = paymentMethodId;
      await user.save();

      return { success: true };
    } catch (error) {
      console.error("Set default payment method error:", error);
      throw error;
    }
  }

  async handleFailedPayment(userId, invoiceId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      // Update subscription status
      user.subscription.status = "past_due";
      await user.save();

      // Create failed transaction record
      await Transaction.create({
        userId: user._id,
        stripeInvoiceId: invoiceId,
        type: "subscription_renewal",
        amount: 0,
        status: "failed",
        description: "Subscription renewal payment failed",
        failureMessage: "Payment method declined",
      });

      // Send notification (implement email service)
      // await emailService.sendPaymentFailedEmail(user);

      return { success: true };
    } catch (error) {
      console.error("Handle failed payment error:", error);
      throw error;
    }
  }

  async generateInvoice(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId);

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      // Generate invoice (you can use a PDF generation library)
      // This is a placeholder for invoice generation logic
      const invoice = {
        id: transaction._id,
        date: transaction.createdAt,
        amount: transaction.amount,
        description: transaction.description,
        status: transaction.status,
      };

      return invoice;
    } catch (error) {
      console.error("Generate invoice error:", error);
      throw error;
    }
  }
}

module.exports = new BillingService();
