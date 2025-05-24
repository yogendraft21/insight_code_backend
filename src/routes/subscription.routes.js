// routes/subscription.routes.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/SubscriptionController');
const { authenticate } = require('../middlewares/authMiddleware');

// All routes require authentication except webhook
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

// Protected routes
router.use(authenticate);

router.get('/plans', subscriptionController.getPlans);
router.get('/current', subscriptionController.getCurrentSubscription);
router.post('/subscribe', subscriptionController.createSubscription);
router.put('/update', subscriptionController.updateSubscription);
router.post('/cancel', subscriptionController.cancelSubscription);
router.post('/reactivate', subscriptionController.reactivateSubscription);

module.exports = router;