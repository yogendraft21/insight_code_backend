// helpers/commentProcessor.js - Enhanced for better comment formatting
const logger = require("../utils/logger");

class CommentProcessor {
  /**
   * Processes AI comments and maps them to correct line numbers
   */
  processComments(comments, diffAnalysis) {
    if (!comments || !Array.isArray(comments)) {
      return [];
    }

    return comments
      .map((comment) => this.processComment(comment, diffAnalysis))
      .filter((comment) => comment !== null);
  }

  /**
   * Process a single comment
   */
  processComment(comment, diffAnalysis) {
    try {
      // Validate required fields
      if (!comment.file || typeof comment.line === "undefined") {
        logger.warn("Comment missing file or line", { comment });
        return null;
      }

      // Get file analysis
      const fileAnalysis = diffAnalysis.files[comment.file];
      if (!fileAnalysis) {
        logger.warn(`File not found in diff: ${comment.file}`);
        return null;
      }

      // Map line number to diff position
      const diffPosition = this.findDiffPosition(fileAnalysis, comment.line);
      if (!diffPosition) {
        logger.warn(`Could not map line ${comment.line} in ${comment.file}`);
        return null;
      }

      // Enhance comment with context
      const enhancedComment = {
        ...comment,
        diffPosition,
        severity: comment.severity || "medium",
        type: comment.type || "issue",
        formattedComment: this.formatComment(comment),
      };

      return enhancedComment;
    } catch (error) {
      logger.error("Error processing comment", {
        error: error.message,
        comment,
      });
      return null;
    }
  }

  /**
   * Find diff position for a line number
   */
  findDiffPosition(fileAnalysis, lineNumber) {
    const lineData = fileAnalysis.lineMapping[lineNumber];

    if (lineData) {
      return lineData.diffPosition;
    }

    // If exact line not found, find closest commentable line
    const availableLines = Object.keys(fileAnalysis.lineMapping).map(Number);
    const closestLine = availableLines.reduce((prev, curr) => {
      return Math.abs(curr - lineNumber) < Math.abs(prev - lineNumber)
        ? curr
        : prev;
    }, availableLines[0]);

    if (closestLine && Math.abs(closestLine - lineNumber) <= 5) {
      logger.info(`Using nearby line ${closestLine} instead of ${lineNumber}`);
      return fileAnalysis.lineMapping[closestLine].diffPosition;
    }

    return null;
  }

  /**
   * Format comment for GitHub with better styling
   */
  formatComment(comment) {
    let formatted = "";

    // Add severity badge with appropriate emoji
    const severityConfig = {
      critical: { emoji: "🚨", label: "CRITICAL" },
      high: { emoji: "⚠️", label: "HIGH" },
      medium: { emoji: "📝", label: "MEDIUM" },
      low: { emoji: "💡", label: "LOW" },
    };

    const severity = severityConfig[comment.severity] || severityConfig.medium;
    formatted += `${severity.emoji} **[${severity.label}]** `;

    // Add category if present
    if (comment.category) {
      formatted += `*${comment.category}* - `;
    }

    // Add main comment
    formatted += comment.comment;

    // Add suggestion with code example if present
    if (comment.suggestion) {
      // Check if suggestion contains code (has newlines or looks like code)
      const hasCode =
        comment.suggestion.includes("\n") ||
        comment.suggestion.includes("{") ||
        comment.suggestion.includes(";") ||
        comment.suggestion.includes("=");

      if (hasCode) {
        // Format as code block
        formatted +=
          "\n\n**Suggested fix:**\n```javascript\n" +
          comment.suggestion +
          "\n```";
      } else {
        // Format as regular text
        formatted += "\n\n**Suggestion:** " + comment.suggestion;
      }
    }

    // Add educational context if present
    if (comment.context) {
      formatted += "\n\n📚 **Why this matters:** " + comment.context;
    }

    return formatted;
  }

  /**
   * Separate inline and general comments
   */
  separateComments(comments) {
    const inline = [];
    const general = [];
  
    comments.forEach((comment) => {
      if (comment.file && comment.line > 0) {
        inline.push({
          path: comment.file,
          line: comment.line,      // Use actual line number
          body: comment.formattedComment,
          // Keep position as fallback
          position: comment.diffPosition,
        });
      } else {
        general.push({
          body: this.formatGeneralComment(comment),
        });
      }
    });
  
    return { inlineComments: inline, generalComments: general };
  }

  /**
   * Format general comments (not tied to specific lines)
   */
  formatGeneralComment(comment) {
    let formatted = comment.formattedComment;

    if (comment.file) {
      formatted = `**File:** \`${comment.file}\`\n`;
      if (comment.line) {
        formatted += `**Line:** ${comment.line}\n`;
      }
      formatted += `\n${comment.formattedComment}`;
    }

    return formatted;
  }

  /**
   * Validate and enhance AI response
   */
  validateAndEnhanceResponse(aiResponse) {
    const validated = {
      summary: aiResponse.summary || "AI Code Review completed",
      comments: [],
      metrics: this.validateMetrics(aiResponse.metrics),
      overallAssessment: this.validateAssessment(aiResponse.overallAssessment),
    };

    // Process comments
    if (Array.isArray(aiResponse.comments)) {
      validated.comments = aiResponse.comments
        .map((comment) => this.validateComment(comment))
        .filter(Boolean);
    }

    return validated;
  }

  /**
   * Validate individual comment
   */
  validateComment(comment) {
    if (
      !comment.file ||
      typeof comment.line === "undefined" ||
      !comment.comment
    ) {
      return null;
    }

    // Ensure severity is valid
    const validSeverities = ["critical", "high", "medium", "low"];
    const severity = validSeverities.includes(comment.severity)
      ? comment.severity
      : "medium";

    return {
      file: comment.file,
      line: parseInt(comment.line) || 0,
      type: comment.type || "issue",
      severity: severity,
      category: comment.category || "general",
      comment: comment.comment,
      suggestion: comment.suggestion,
      context: comment.context,
    };
  }

  /**
   * Validate metrics
   */
  validateMetrics(metrics) {
    const defaults = {
      readability: 5,
      maintainability: 5,
      security: 5,
      performance: 5,
      testCoverage: 5,
      architecturalQuality: 5,
    };

    if (!metrics) return defaults;

    return {
      readability: this.validateScore(metrics.readability, 5),
      maintainability: this.validateScore(metrics.maintainability, 5),
      security: this.validateScore(metrics.security, 5),
      performance: this.validateScore(metrics.performance, 5),
      testCoverage: this.validateScore(metrics.testCoverage, 5),
      architecturalQuality: this.validateScore(metrics.architecturalQuality, 5),
    };
  }

  /**
   * Validate a score (1-10)
   */
  validateScore(score, defaultValue = 5) {
    const parsed = parseInt(score);
    if (isNaN(parsed) || parsed < 1 || parsed > 10) {
      return defaultValue;
    }
    return parsed;
  }

  /**
   * Validate overall assessment
   */
  validateAssessment(assessment) {
    if (!assessment) {
      return {
        verdict: "needs_discussion",
        reasoning: "Review completed",
        positiveAspects: [],
        mainConcerns: [],
        learningOpportunities: [],
      };
    }

    return {
      verdict: assessment.verdict || "needs_discussion",
      reasoning: assessment.reasoning || "Review completed",
      positiveAspects: Array.isArray(assessment.positiveAspects)
        ? assessment.positiveAspects
        : [],
      mainConcerns: Array.isArray(assessment.mainConcerns)
        ? assessment.mainConcerns
        : [],
      learningOpportunities: Array.isArray(assessment.learningOpportunities)
        ? assessment.learningOpportunities
        : [],
    };
  }
}

module.exports = CommentProcessor;
