// helpers/reviewManager.js - Simplified to match your exact schema
const PullRequest = require("../models/PullRequest");
const logger = require("../utils/logger");

class ReviewManager {
  async initializeReview(pullRequest, isReReview) {
    try {
      const reviewId = `review_${Date.now()}_${pullRequest.reviews.length + 1}`;

      const newReview = {
        reviewId: reviewId,
        status: "in_progress",
        createdAt: new Date(),
        feedback: [],
        metrics: {
          codeQualityScore: 5,
          complexity: 5,
          readability: 5,
          maintainability: 5,
          securityScore: 5,
        },
      };

      pullRequest.reviews.push(newReview);
      await pullRequest.save();

      return reviewId;
    } catch (error) {
      logger.error("Error initializing review", { error: error.message });
      throw error;
    }
  }

  async updateReviewStatus(pullRequestId, reviewId, analysis, commentResults) {
    try {
      const pullRequest = await PullRequest.findById(pullRequestId);

      if (!pullRequest) {
        throw new Error("Pull request not found");
      }

      const reviewIndex = pullRequest.reviews.findIndex(
        (r) => r.reviewId === reviewId
      );
      if (reviewIndex === -1) {
        throw new Error(`Review not found: ${reviewId}`);
      }

      // Process feedback to match schema exactly
      const processedFeedback = this.processFeedback(analysis.comments);

      // Update review fields that exist in schema
      pullRequest.reviews[reviewIndex].status = "completed";
      pullRequest.reviews[reviewIndex].completedAt = new Date();
      pullRequest.reviews[reviewIndex].summary =
        analysis.summary || "AI Code Review completed";
      pullRequest.reviews[reviewIndex].feedback = processedFeedback;
      pullRequest.reviews[reviewIndex].metrics = this.processMetrics(
        analysis.metrics
      );

      await pullRequest.save();
      return pullRequest.reviews[reviewIndex];
    } catch (error) {
      logger.error("Error updating review status", { error: error.message });
      throw error;
    }
  }

  processFeedback(comments) {
    if (!comments || !Array.isArray(comments)) {
      return [];
    }

    return comments
      .filter((comment) => comment && comment.file && comment.comment)
      .map((comment) => ({
        path: comment.file,
        line: parseInt(comment.line) || 0,
        comment: comment.comment,
        type: this.mapCommentType(comment.type),
        severity: this.mapSeverity(comment.severity),
      }));
  }

  mapCommentType(type) {
    // Your schema allows: suggestion, issue, praise, question
    const validTypes = ["suggestion", "issue", "praise", "question"];
    if (validTypes.includes(type)) {
      return type;
    }
    // Map common variations
    if (type === "improvement") return "suggestion";
    if (type === "bug" || type === "error") return "issue";
    return "suggestion"; // default
  }

  mapSeverity(severity) {
    // Your schema allows: low, medium, high
    if (severity === "critical") return "high";
    if (["low", "medium", "high"].includes(severity)) {
      return severity;
    }
    return "medium"; // default
  }

  processMetrics(metrics) {
    if (!metrics) {
      return {
        codeQualityScore: 5,
        complexity: 5,
        readability: 5,
        maintainability: 5,
        securityScore: 5,
      };
    }

    // Map to your schema's metric names
    return {
      codeQualityScore: this.validateScore(metrics.codeQualityScore),
      complexity: this.validateScore(
        metrics.complexity || metrics.performance || 5
      ),
      readability: this.validateScore(metrics.readability),
      maintainability: this.validateScore(metrics.maintainability),
      securityScore: this.validateScore(
        metrics.securityScore || metrics.security
      ),
    };
  }

  validateScore(score) {
    const num = parseInt(score) || 5;
    return Math.min(Math.max(num, 1), 10);
  }

  async markReviewFailed(pullRequestId, reviewId, errorMessage) {
    try {
      if (!reviewId) return;

      const pullRequest = await PullRequest.findById(pullRequestId);
      if (!pullRequest) return;

      const reviewIndex = pullRequest.reviews.findIndex(
        (r) => r.reviewId === reviewId
      );
      if (reviewIndex === -1) return;

      pullRequest.reviews[reviewIndex].status = "failed";
      pullRequest.reviews[reviewIndex].completedAt = new Date();
      pullRequest.reviews[reviewIndex].error = errorMessage;

      await pullRequest.save();
    } catch (error) {
      logger.error("Error marking review as failed", { error: error.message });
    }
  }
}

module.exports = ReviewManager;
