// routes/credit.routes.js
const express = require('express');
const router = express.Router();
const creditController = require('../controllers/CreditController');
const { authenticate } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(authenticate);

router.get('/balance', creditController.getBalance);
router.get('/packages', creditController.getPackages);
router.post('/purchase', creditController.purchaseCredits);
router.post('/use', creditController.useCredits);
router.get('/usage', creditController.getUsageHistory);
router.get('/check-availability', creditController.checkAvailability);

module.exports = router;