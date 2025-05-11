// aiReviewService.js - Enhanced with chunking for large PRs
const PullRequest = require("../models/PullRequest");
const Repository = require("../models/Repository");
const githubService = require("./githubService");
const openaiService = require("./openaiService");
const logger = require("../utils/logger");
const DiffAnalyzer = require("../helpers/diffAnalyzer");
const ContextBuilder = require("../helpers/contextBuilder");
const PromptBuilder = require("../helpers/promptBuilder");
const CommentProcessor = require("../helpers/commentProcessor");
const ReviewManager = require("../helpers/reviewManager");

class AIReviewService {
  constructor() {
    this.diffAnalyzer = new DiffAnalyzer();
    this.contextBuilder = new ContextBuilder();
    this.promptBuilder = new PromptBuilder();
    this.commentProcessor = new CommentProcessor();
    this.reviewManager = new ReviewManager();
  }

  async reviewPullRequest(pullRequestId, isReReview = false) {
    let reviewId;

    try {
      // Load PR and repository
      const { pullRequest, repository } = await this.loadPullRequest(
        pullRequestId
      );

      // Initialize review
      reviewId = await this.reviewManager.initializeReview(
        pullRequest,
        isReReview
      );

      // Get structured PR data
      const prData = await this.collectPullRequestData(
        repository,
        pullRequest,
        isReReview
      );

      // Check if we need to chunk the review
      let analysis;
      if (this.promptBuilder.needsChunking(prData)) {
        logger.info("Large PR detected, using chunked review");
        analysis = await this.analyzeWithChunking(
          prData,
          pullRequest,
          isReReview
        );
      } else {
        analysis = await this.analyzeWithAI(prData, pullRequest, isReReview);
      }

      // Post comments and update review
      await this.postResults(repository, pullRequest, reviewId, analysis);

      logger.info(
        `Review completed successfully for PR #${pullRequest.prNumber}`
      );
      return reviewId;
    } catch (error) {
      logger.error("Error in AI review", { error: error.message });

      if (reviewId) {
        await this.reviewManager.markReviewFailed(
          pullRequestId,
          reviewId,
          error.message
        );
      }

      throw error;
    }
  }

  async loadPullRequest(pullRequestId) {
    const pullRequest = await PullRequest.findById(pullRequestId).populate(
      "repositoryId"
    );

    if (!pullRequest) {
      throw new Error("Pull request not found");
    }

    return {
      pullRequest,
      repository: pullRequest.repositoryId,
    };
  }

  async collectPullRequestData(repository, pullRequest, isReReview) {
    // Get PR diff and files
    const prFiles = await githubService.getPullRequestFiles(
      repository.installationId,
      repository.owner,
      repository.name,
      pullRequest.prNumber
    );

    // Analyze diff to get proper line mappings
    const diffAnalysis = this.diffAnalyzer.analyzePRFiles(prFiles);

    // Build context for the review
    const context = await this.contextBuilder.buildContext(
      repository,
      pullRequest,
      diffAnalysis,
      isReReview
    );

    return {
      diffAnalysis,
      context,
      files: prFiles,
    };
  }

  async analyzeWithAI(prData, pullRequest, isReReview) {
    // Build optimized prompt
    const prompt = this.promptBuilder.buildPrompt(
      prData,
      pullRequest,
      isReReview
    );

    // Get AI analysis
    const aiResponse = await openaiService.analyzeCodeWithRetry(prompt);

    // Process and validate comments
    const processedComments = this.commentProcessor.processComments(
      aiResponse.comments,
      prData.diffAnalysis
    );

    return {
      summary: aiResponse.summary,
      comments: processedComments,
      metrics: aiResponse.metrics,
      suggestions: aiResponse.suggestions,
    };
  }

  async analyzeWithChunking(prData, pullRequest, isReReview) {
    const files = Object.entries(prData.diffAnalysis.files);
    const totalChunks = Math.ceil(files.length / 5); // 5 files per chunk

    logger.info(`Analyzing PR in ${totalChunks} chunks`);

    const allComments = [];
    const metricsList = [];
    let overallSummary = "";

    // Process each chunk
    for (let i = 0; i < totalChunks; i++) {
      logger.info(`Processing chunk ${i + 1}/${totalChunks}`);

      try {
        // Build chunk-specific prompt
        const chunkPrompt = this.promptBuilder.buildChunkedPrompt(
          prData,
          pullRequest,
          isReReview,
          i,
          totalChunks
        );

        // Analyze chunk
        const chunkResponse = await openaiService.analyzeCodeWithRetry(
          chunkPrompt
        );

        // Collect results
        if (chunkResponse.comments) {
          allComments.push(...chunkResponse.comments);
        }

        if (chunkResponse.metrics) {
          metricsList.push(chunkResponse.metrics);
        }

        if (chunkResponse.summary) {
          overallSummary += `\nChunk ${i + 1}: ${chunkResponse.summary}`;
        }
      } catch (error) {
        logger.error(`Error analyzing chunk ${i + 1}`, {
          error: error.message,
        });
        // Continue with other chunks
      }
    }

    // Combine results
    const combinedMetrics = this.combineMetrics(metricsList);
    const processedComments = this.commentProcessor.processComments(
      allComments,
      prData.diffAnalysis
    );

    return {
      summary: this.generateCombinedSummary(overallSummary, processedComments),
      comments: processedComments,
      metrics: combinedMetrics,
      suggestions: [],
    };
  }

  combineMetrics(metricsList) {
    if (metricsList.length === 0) {
      return {
        readability: 5,
        maintainability: 5,
        security: 5,
        performance: 5,
        testCoverage: 5,
        architecturalQuality: 5,
      };
    }

    // Average all metrics
    const combined = {};
    const metricKeys = Object.keys(metricsList[0]);

    metricKeys.forEach((key) => {
      const values = metricsList
        .map((m) => m[key] || 5)
        .filter((v) => !isNaN(v));
      combined[key] = Math.round(
        values.reduce((a, b) => a + b, 0) / values.length
      );
    });

    return combined;
  }

  generateCombinedSummary(chunkSummaries, comments) {
    const issueCount = comments.filter((c) => c.type === "issue").length;
    const criticalCount = comments.filter(
      (c) => c.severity === "critical"
    ).length;

    let summary = `Found ${issueCount} issues`;
    if (criticalCount > 0) {
      summary += ` (${criticalCount} critical)`;
    }

    if (chunkSummaries) {
      summary += ". " + chunkSummaries.trim();
    }

    return summary;
  }

  async postResults(repository, pullRequest, reviewId, analysis) {
    // Post comments to GitHub
    const commentResults = await this.postReviewComments(
      repository,
      pullRequest,
      analysis.comments
    );

    // Update review status
    await this.reviewManager.updateReviewStatus(
      pullRequest._id,
      reviewId,
      analysis,
      commentResults
    );
  }

  async postReviewComments(repository, pullRequest, comments) {
    try {
      // Separate inline and general comments
      const { inlineComments, generalComments } =
        this.commentProcessor.separateComments(comments);

      // Post inline comments
      let inlineResults = { success: 0, failed: 0 };
      if (inlineComments.length > 0) {
        inlineResults = await githubService.createReviewWithComments(
          repository.installationId,
          repository.owner,
          repository.name,
          pullRequest.prNumber,
          inlineComments,
          pullRequest.lastCommitSha
        );
      }

      // Post general comments
      let generalResults = { success: 0, failed: 0 };
      for (const comment of generalComments) {
        try {
          await githubService.addComment(
            repository.installationId,
            repository.owner,
            repository.name,
            pullRequest.prNumber,
            comment.body
          );
          generalResults.success++;
        } catch (error) {
          logger.error("Failed to post general comment", {
            error: error.message,
          });
          generalResults.failed++;
        }
      }

      return {
        inline: inlineResults,
        general: generalResults,
        totalSuccess: inlineResults.success + generalResults.success,
        totalFailed: inlineResults.failed + generalResults.failed,
      };
    } catch (error) {
      logger.error("Error posting review comments", { error: error.message });
      throw error;
    }
  }
}

module.exports = new AIReviewService();
