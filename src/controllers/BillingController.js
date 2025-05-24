// controllers/BillingController.js
const billingService = require('../services/BillingService');

class BillingController {
  async getTransactions(req, res) {
    try {
      const userId = req.user._id;
      const { page, limit, type, status } = req.query;
      
      const transactions = await billingService.getTransactionHistory(userId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        type,
        status
      });
      
      res.json({ success: true, ...transactions });
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getInvoices(req, res) {
    try {
      const userId = req.user._id;
      const { limit } = req.query;
      
      const invoices = await billingService.getInvoices(
        userId,
        parseInt(limit) || 10
      );
      
      res.json({ success: true, invoices });
    } catch (error) {
      console.error('Get invoices error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPaymentMethods(req, res) {
    try {
      const userId = req.user._id;
      const paymentMethods = await billingService.getPaymentMethods(userId);
      
      res.json({ success: true, paymentMethods });
    } catch (error) {
      console.error('Get payment methods error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async addPaymentMethod(req, res) {
    try {
      const userId = req.user._id;
      const { paymentMethodId } = req.body;
      
      const result = await billingService.addPaymentMethod(userId, paymentMethodId);
      
      res.json(result);
    } catch (error) {
      console.error('Add payment method error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async setDefaultPaymentMethod(req, res) {
    try {
      const userId = req.user._id;
      const { paymentMethodId } = req.body;
      
      const result = await billingService.setDefaultPaymentMethod(
        userId,
        paymentMethodId
      );
      
      res.json(result);
    } catch (error) {
      console.error('Set default payment method error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async removePaymentMethod(req, res) {
    try {
      const userId = req.user._id;
      const { paymentMethodId } = req.params;
      
      // Implement payment method removal
      // This would involve detaching from Stripe and updating user record
      
      res.json({ success: true });
    } catch (error) {
      console.error('Remove payment method error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async downloadInvoice(req, res) {
    try {
      const userId = req.user._id;
      const { transactionId } = req.params;
      
      const invoice = await billingService.generateInvoice(transactionId);
      
      // Set appropriate headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${transactionId}.pdf`);
      
      // Send the invoice (this is a placeholder - implement actual PDF generation)
      res.json(invoice);
    } catch (error) {
      console.error('Download invoice error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new BillingController();