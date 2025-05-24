// routes/billing.routes.js
const express = require('express');
const router = express.Router();
const billingController = require('../controllers/BillingController');
const { authenticate } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(authenticate);

router.get('/transactions', billingController.getTransactions);
router.get('/invoices', billingController.getInvoices);
router.get('/payment-methods', billingController.getPaymentMethods);
router.post('/payment-methods', billingController.addPaymentMethod);
router.put('/default-payment', billingController.setDefaultPaymentMethod);
router.delete('/payment-methods/:paymentMethodId', billingController.removePaymentMethod);
router.get('/invoice/:transactionId', billingController.downloadInvoice);

module.exports = router;