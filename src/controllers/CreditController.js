// controllers/CreditController.js
const CreditPackage = require('../models/CreditPackage');
const creditService = require('../services/CreditService');

class CreditController {
  async getBalance(req, res) {
    try {
      const userId = req.user._id;
      const balance = await creditService.getCreditsBalance(userId);
      res.json({ success: true, ...balance });
    } catch (error) {
      console.error('Get balance error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPackages(req, res) {
    try {
      const packages = await CreditPackage.findActive();
      res.json({ success: true, packages });
    } catch (error) {
      console.error('Get packages error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async purchaseCredits(req, res) {
    try {
      const userId = req.user._id;
      const { packageId, paymentMethodId } = req.body;
      
      const result = await creditService.purchaseCredits(
        userId,
        packageId,
        paymentMethodId
      );
      
      res.json({
        success: true,
        clientSecret: result.clientSecret,
        transactionId: result.transactionId
      });
    } catch (error) {
      console.error('Purchase credits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async useCredits(req, res) {
    try {
      const userId = req.user._id;
      const { amount, reason, metadata } = req.body;
      
      const result = await creditService.useCredits(userId, amount, reason, metadata);
      
      res.json(result);
    } catch (error) {
      console.error('Use credits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUsageHistory(req, res) {
    try {
      const userId = req.user._id;
      const { page, limit, type } = req.query;
      
      const history = await creditService.getCreditHistory(userId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        type
      });
      
      res.json({ success: true, ...history });
    } catch (error) {
      console.error('Get usage history error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async checkAvailability(req, res) {
    try {
      const userId = req.user._id;
      const { required } = req.query;
      
      const availability = await creditService.checkCreditAvailability(
        userId,
        parseInt(required)
      );
      
      res.json({ success: true, ...availability });
    } catch (error) {
      console.error('Check availability error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new CreditController();