// aiReviewService.js - Complete service with inline comments and re-review
const PullRequest = require("../models/PullRequest");
const Repository = require("../models/Repository");
const githubService = require("./githubService");
const openaiService = require("./openaiService");
const logger = require("../utils/logger");

class AIReviewService {
  async reviewPullRequest(pullRequestId, isReReview = false) {
    let reviewId;

    try {
      const pullRequest = await PullRequest.findById(pullRequestId).populate(
        "repositoryId"
      );

      if (!pullRequest) {
        throw new Error("Pull request not found");
      }

      const repository = pullRequest.repositoryId;

      // Create review ID
      const existingReviews = pullRequest.reviews || [];
      const reviewCount = existingReviews.length;
      reviewId = `review_${Date.now()}_${reviewCount + 1}`;

      // For re-reviews, mark previous reviews as superseded
      if (isReReview && existingReviews.length > 0) {
        await this.markPreviousReviewsAsSuperseded(pullRequestId);
      }

      // Add new review with proper structure
      await pullRequest.addReview({
        reviewId,
        status: "in_progress",
        createdAt: new Date(),
        isReReview,
        reviewNumber: reviewCount + 1,
      });

      // Get PR diff and files
      const prDiff = await this.getPullRequestDiff(
        repository.installationId,
        repository.owner,
        repository.name,
        pullRequest.prNumber
      );

      // Get repository context
      const repoContext = await this.getRepositoryContext(
        repository.installationId,
        repository.owner,
        repository.name,
        pullRequest
      );

      // Analyze the PR with AI
      const analysisResult = await this.analyzeWithAI(
        prDiff,
        repoContext,
        pullRequest,
        isReReview
      );

      // Post comments on GitHub - wrap in try-catch to handle partial success
      try {
        await this.postReviewComments(
          repository.installationId,
          repository.owner,
          repository.name,
          pullRequest.prNumber,
          analysisResult.comments,
          pullRequest.lastCommitSha
        );
      } catch (commentError) {
        logger.error("Error posting some comments, but continuing", {
          error: commentError.message,
        });
        // Don't throw - we want to update the review status even if some comments failed
      }

      // Update review status to completed
      await this.updateReviewStatus(
        pullRequestId,
        reviewId,
        analysisResult,
        "completed"
      );

      logger.info(
        `Review completed successfully for PR #${pullRequest.prNumber}`
      );
      return reviewId;
    } catch (error) {
      logger.error("Error in AI review", { error: error.message });

      // Update review status to failed
      if (reviewId) {
        try {
          await this.updateReviewStatus(
            pullRequestId,
            reviewId,
            null,
            "failed",
            error.message
          );
        } catch (updateError) {
          logger.error("Error updating failed review status", {
            error: updateError.message,
          });
        }
      }

      throw error;
    }
  }

  async markPreviousReviewsAsSuperseded(pullRequestId) {
    try {
      await PullRequest.findByIdAndUpdate(pullRequestId, {
        $set: {
          "reviews.$[].isSuperseded": true,
        },
      });
    } catch (error) {
      logger.error("Error marking reviews as superseded", {
        error: error.message,
      });
    }
  }

  async getPullRequestDiff(installationId, owner, repo, prNumber) {
    try {
      const files = await githubService.getPullRequestFiles(
        installationId,
        owner,
        repo,
        prNumber
      );

      const processedFiles = files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        previousFilename: file.previous_filename,
      }));

      return {
        files: processedFiles,
        totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
        totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
        totalChanges: files.reduce((sum, file) => sum + file.changes, 0),
      };
    } catch (error) {
      logger.error("Error getting PR diff", { error: error.message });
      throw error;
    }
  }

  async getRepositoryContext(installationId, owner, repo, pullRequest) {
    try {
      const context = {
        repositoryInfo: {},
        relatedFiles: [],
        projectStructure: [],
        previousReviews: [],
      };

      // Get basic repository info
      context.repositoryInfo = await githubService.getRepository(
        installationId,
        owner,
        repo
      );

      // Get previous reviews for this PR
      context.previousReviews = pullRequest.reviews.filter(
        (review) => review.status === "completed" && !review.isSuperseded
      );

      return context;
    } catch (error) {
      logger.error("Error getting repository context", {
        error: error.message,
      });
      throw error;
    }
  }

  async analyzeWithAI(prDiff, repoContext, pullRequest, isReReview) {
    try {
      const prompt = this.buildAIPrompt(
        prDiff,
        repoContext,
        pullRequest,
        isReReview
      );
      const aiResponse = await openaiService.analyzeCode(prompt);
      const parsedResponse = this.parseAIResponse(aiResponse);

      return {
        summary: parsedResponse.summary,
        comments: parsedResponse.comments,
        metrics: parsedResponse.metrics,
        suggestions: parsedResponse.suggestions,
      };
    } catch (error) {
      logger.error("Error in AI analysis", { error: error.message });
      throw error;
    }
  }

  buildAIPrompt(prDiff, repoContext, pullRequest, isReReview) {
    // Start with basic PR information
    let prompt = `
You are a code reviewer analyzing a pull request.

PULL REQUEST DETAILS:
- Title: ${pullRequest.title}
- Description: ${pullRequest.description || "No description"}
- Type: ${
      isReReview
        ? "RE-REVIEW (check if previous issues were fixed)"
        : "INITIAL REVIEW"
    }
- Repository: ${repoContext.repositoryInfo.full_name}
- Language: ${repoContext.repositoryInfo.language || "Not specified"}
`;

    // Add previous review context for re-reviews
    if (isReReview && repoContext.previousReviews.length > 0) {
      const lastReview =
        repoContext.previousReviews[repoContext.previousReviews.length - 1];
      prompt += `\nPREVIOUS REVIEW:
- Found ${lastReview.feedback.length} issues
- Issues to verify:`;

      lastReview.feedback.forEach((fb, index) => {
        prompt += `\n  ${index + 1}. ${fb.comment} (${fb.path}:${fb.line})`;
      });
    }

    // Add file changes summary
    prompt += `\n\nCHANGES SUMMARY:
- Files changed: ${prDiff.files.length}
- Lines added: ${prDiff.totalAdditions}
- Lines removed: ${prDiff.totalDeletions}
`;

    // Add detailed file changes with diffs
    prompt += `\nFILE CHANGES:`;

    prDiff.files.forEach((file, index) => {
      prompt += `\n\n${index + 1}. ${file.filename}`;
      prompt += `\n   Status: ${file.status}`;
      prompt += `\n   Changes: +${file.additions} -${file.deletions}`;

      if (file.patch) {
        prompt += `\n   Diff:\n\`\`\`diff\n${file.patch}\n\`\`\``;
      }
    });

    // Add review instructions
    prompt += `\n\nREVIEW INSTRUCTIONS:

ONLY REPORT THESE ISSUES:
1. console.log statements - MUST be removed
2. ONLY comment on ACTUAL unused code - if you see it being used, don't comment
3. Missing error handling - MUST be added
4. Security vulnerabilities - MUST be fixed
5. Memory leaks - MUST be fixed

DO NOT COMMENT ON:
- Quote styles (' vs ")
- Code formatting
- Variable naming
- Code organization
- "Improvements" or "refactoring"

HOW TO READ DIFFS:
- Lines starting with @@ show line numbers
- Lines starting with + are additions (review these)
- Lines starting with - are deletions (ignore these)
- Example: "@@ -29,7 +32,10 @@" means new code starts at line 32

RESPONSE FORMAT:
{
  "summary": "Found X critical issues",
  "comments": [
    {
      "file": "exact/path/from/diff",
      "line": <exact line number>,
      "type": "issue",
      "severity": "high|medium|low",
      "comment": "Direct instruction (see examples below)"
    }
  ],
  "metrics": {
    "readability": 8,
    "maintainability": 7,
    "security": 9,
    "performance": 8
  },
  "suggestions": []
}

EXAMPLE COMMENTS:

For console.log:
{
  "file": "src/components/Button.js",
  "line": 45,
  "type": "issue",
  "severity": "high",
  "comment": "Remove console.log statement (line 45)"
}

For unused code:
{
  "file": "src/utils/helpers.js",
  "line": 32,
  "type": "issue",
  "severity": "medium",
  "comment": "Remove unused function 'factorial' (line 32)"
}

For missing error handling:
{
  "file": "src/api/client.js",
  "line": 67,
  "type": "issue",
  "severity": "high",
  "comment": "Add error handling for API call (line 67)\\nCurrent: \`const data = await fetch(url);\`\\nFix: \`try { const data = await fetch(url); } catch (error) { console.error(error); throw error; }\`"
}

IMPORTANT:
- Use EXACT line numbers from the diff
- Be specific and direct
- Include code examples only for complex fixes
- Every comment MUST have a line number`;

    return prompt;
  }

  parseAIResponse(aiResponse) {
    try {
      if (typeof aiResponse === "object") {
        return aiResponse;
      }

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        summary: "Failed to parse AI response",
        comments: [],
        metrics: {
          readability: 5,
          maintainability: 5,
          security: 5,
          performance: 5,
        },
        suggestions: [],
      };
    } catch (error) {
      logger.error("Error parsing AI response", { error: error.message });
      return {
        summary: "Error parsing response",
        comments: [],
        metrics: {},
        suggestions: [],
      };
    }
  }

  async postReviewComments(
    installationId,
    owner,
    repo,
    prNumber,
    comments,
    commitSha
  ) {
    try {
      if (!comments || comments.length === 0) {
        logger.info("No comments to post");
        return;
      }

      // Filter and validate comments
      const validComments = comments
        .filter((comment) => comment && comment.file && comment.line > 0)
        .map((comment) => ({
          path: comment.file,
          line: parseInt(comment.line),
          body: `**${comment.type ? comment.type.toUpperCase() : "COMMENT"}** ${
            comment.severity ? `(${comment.severity})` : ""
          }: ${comment.comment || ""}`,
        }));

      logger.info(`Posting ${validComments.length} inline comments`);

      if (validComments.length > 0) {
        try {
          await githubService.createReview(
            installationId,
            owner,
            repo,
            prNumber,
            validComments,
            commitSha
          );
        } catch (error) {
          logger.error("Failed to create review with inline comments", {
            error: error.message,
          });

          // Fallback: post as regular comments
          for (const comment of validComments) {
            await githubService.addComment(
              installationId,
              owner,
              repo,
              prNumber,
              `**${comment.path}** (Line ${comment.line})\n${comment.body}`
            );
          }
        }
      }

      // Handle general comments
      const generalComments = comments.filter(
        (comment) => !comment.file || !comment.line || comment.line <= 0
      );

      for (const comment of generalComments) {
        if (comment && comment.comment) {
          await githubService.addComment(
            installationId,
            owner,
            repo,
            prNumber,
            `**${comment.type ? comment.type.toUpperCase() : "COMMENT"}**: ${
              comment.comment
            }`
          );
        }
      }
    } catch (error) {
      logger.error("Error posting review comments", { error: error.message });
      throw error;
    }
  }

  async updateReviewStatus(
    pullRequestId,
    reviewId,
    analysisResult,
    status = "completed",
    errorMessage = null
  ) {
    try {
      const pullRequest = await PullRequest.findById(pullRequestId);

      const reviewIndex = pullRequest.reviews.findIndex(
        (r) => r.reviewId === reviewId
      );

      if (reviewIndex === -1) {
        throw new Error("Review not found");
      }

      // Ensure all required fields are present
      const updatedReview = {
        reviewId: reviewId,
        status: status,
        createdAt: pullRequest.reviews[reviewIndex].createdAt, // Keep existing created date
        completedAt:
          status === "completed"
            ? new Date()
            : pullRequest.reviews[reviewIndex].completedAt,
        error: errorMessage,
        feedback: [],
        summary: "",
        metrics: {
          codeQualityScore: 5,
          readability: 5,
          maintainability: 5,
          securityScore: 5,
          complexity: 5,
        },
      };

      // Add analysis results if available and status is completed
      if (status === "completed" && analysisResult) {
        updatedReview.summary = analysisResult.summary || "AI review completed";

        // Map feedback with proper type validation
        updatedReview.feedback = (analysisResult.comments || []).map(
          (comment) => {
            // Map AI types to allowed schema types
            let validType = "suggestion"; // default
            if (comment.type) {
              const typeMap = {
                improvement: "suggestion",
                issue: "issue",
                bug: "issue",
                error: "issue",
                praise: "praise",
                suggestion: "suggestion",
                question: "question",
              };
              validType = typeMap[comment.type.toLowerCase()] || "suggestion";
            }

            return {
              path: comment.file || "",
              line: parseInt(comment.line) || 0,
              comment: comment.comment || "",
              type: validType,
              severity: comment.severity || "medium",
            };
          }
        );

        // Update metrics
        if (analysisResult.metrics) {
          updatedReview.metrics = {
            codeQualityScore:
              Math.round(
                (analysisResult.metrics.readability +
                  analysisResult.metrics.maintainability +
                  analysisResult.metrics.security +
                  analysisResult.metrics.performance) /
                  4
              ) || 5,
            readability: analysisResult.metrics.readability || 5,
            maintainability: analysisResult.metrics.maintainability || 5,
            securityScore: analysisResult.metrics.security || 5,
            complexity: analysisResult.metrics.performance || 5,
          };
        }
      }

      // Replace the entire review object to avoid validation issues
      pullRequest.reviews[reviewIndex] = updatedReview;

      await pullRequest.save();
      logger.info(
        `Review status updated to ${status} for reviewId: ${reviewId}`
      );
    } catch (error) {
      logger.error("Error updating review status", {
        error: error.message,
        stack: error.stack,
      });
      // Don't re-throw to prevent cascade failures
    }
  }
}

module.exports = new AIReviewService();
