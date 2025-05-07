/**
 * Review Routes
 * Handles routes for AI review operations
 */
const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @route POST /review/trigger
 * @desc Trigger AI review for a pull request
 * @access Private
 */
router.post('/trigger', authenticate, reviewController.manualTriggerReview);

/**
 * @route GET /review/status/:reviewId
 * @desc Get review status
 * @access Private
 */
router.get('/status/:reviewId', authenticate, reviewController.getReviewStatus);

/**
 * @route GET /review/list/:owner/:repo/:prNumber
 * @desc List reviews for a pull request
 * @access Private
 */
router.get('/list/:owner/:repo/:prNumber', authenticate, reviewController.listReviews);

module.exports = router;