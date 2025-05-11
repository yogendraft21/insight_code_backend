// helpers/contextBuilder.js - Builds comprehensive context for AI review
const githubService = require("../services/githubService");
const logger = require("../utils/logger");

class ContextBuilder {
  /**
   * Builds comprehensive context for the PR review
   */
  async buildContext(repository, pullRequest, diffAnalysis, isReReview) {
    try {
      const context = {
        repository: await this.getRepositoryContext(repository),
        pullRequest: await this.getPullRequestContext(pullRequest),
        diffAnalysis: this.getDiffContext(diffAnalysis),
        prType: this.determinePRType(pullRequest, diffAnalysis),
        previousReviews: this.getPreviousReviews(pullRequest),
        relatedFiles: await this.getRelatedFiles(repository, pullRequest, diffAnalysis),
      };

      if (isReReview) {
        context.reReviewContext = this.buildReReviewContext(pullRequest);
      }

      return context;
    } catch (error) {
      logger.error("Error building context", { error: error.message });
      throw error;
    }
  }

  /**
   * Get repository context
   */
  async getRepositoryContext(repository) {
    try {
      const repoInfo = await githubService.getRepository(
        repository.installationId,
        repository.owner,
        repository.name
      );

      return {
        full_name: repoInfo.full_name,
        language: repoInfo.language,
        description: repoInfo.description,
        size: repoInfo.size,
        default_branch: repoInfo.default_branch,
        has_issues: repoInfo.has_issues,
        has_wiki: repoInfo.has_wiki,
        topics: repoInfo.topics || [],
        visibility: repoInfo.visibility,
      };
    } catch (error) {
      logger.error("Error getting repository context", { error: error.message });
      return {
        full_name: `${repository.owner}/${repository.name}`,
        language: "Unknown",
      };
    }
  }

  /**
   * Get pull request context
   */
  async getPullRequestContext(pullRequest) {
    return {
      number: pullRequest.prNumber,
      title: pullRequest.title,
      description: pullRequest.description,
      author: pullRequest.author,
      state: pullRequest.state,
      created_at: pullRequest.created_at,
      updated_at: pullRequest.updated_at,
      base_branch: pullRequest.baseBranch,
      head_branch: pullRequest.headBranch,
      commits: pullRequest.commits || 1,
      reviewers: pullRequest.reviewers || [],
      labels: pullRequest.labels || [],
    };
  }

  /**
   * Get diff context
   */
  getDiffContext(diffAnalysis) {
    const context = {
      totalFiles: diffAnalysis.statistics.totalFiles,
      totalAdditions: diffAnalysis.statistics.totalAdditions,
      totalDeletions: diffAnalysis.statistics.totalDeletions,
      fileTypes: {},
      largestChanges: [],
    };

    // Analyze file types
    Object.entries(diffAnalysis.files).forEach(([filename, analysis]) => {
      const ext = this.getFileExtension(filename);
      if (!context.fileTypes[ext]) {
        context.fileTypes[ext] = { count: 0, additions: 0, deletions: 0 };
      }
      context.fileTypes[ext].count++;
      context.fileTypes[ext].additions += analysis.additions;
      context.fileTypes[ext].deletions += analysis.deletions;
    });

    // Find largest changes
    context.largestChanges = Object.entries(diffAnalysis.files)
      .map(([filename, analysis]) => ({
        filename,
        changes: analysis.changes,
        additions: analysis.additions,
        deletions: analysis.deletions,
      }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 5);

    return context;
  }

  /**
   * Determine PR type based on changes
   */
  determinePRType(pullRequest, diffAnalysis) {
    const title = pullRequest.title.toLowerCase();
    const stats = diffAnalysis.statistics;

    // Check title patterns
    if (title.includes('fix') || title.includes('bug')) return 'bugfix';
    if (title.includes('feat') || title.includes('feature')) return 'feature';
    if (title.includes('refactor')) return 'refactor';
    if (title.includes('docs') || title.includes('documentation')) return 'documentation';
    if (title.includes('test')) return 'test';
    if (title.includes('chore') || title.includes('deps')) return 'chore';

    // Analyze based on changes
    if (stats.totalFiles === 1 && stats.totalChanges < 50) return 'small-change';
    if (stats.totalChanges > 500) return 'large-change';
    if (stats.totalAdditions > stats.totalDeletions * 2) return 'feature';
    if (stats.totalDeletions > stats.totalAdditions * 2) return 'refactor';

    return 'general';
  }

  /**
   * Get previous reviews
   */
  getPreviousReviews(pullRequest) {
    if (!pullRequest.reviews || pullRequest.reviews.length === 0) {
      return [];
    }

    return pullRequest.reviews
      .filter(review => review.status === 'completed' && !review.isSuperseded)
      .map(review => ({
        reviewId: review.reviewId,
        createdAt: review.createdAt,
        summary: review.summary,
        feedback: review.feedback || [],
        metrics: review.metrics,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get related files for better context
   */
  async getRelatedFiles(repository, pullRequest, diffAnalysis) {
    const relatedFiles = new Set();
    const importPatterns = {
      javascript: /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g,
      typescript: /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g,
      python: /(?:from\s+(\S+)\s+import|import\s+(\S+))/g,
      java: /import\s+([\w.]+);/g,
    };

    // Analyze imports in changed files
    for (const [filename, analysis] of Object.entries(diffAnalysis.files)) {
      if (!analysis.patch) continue;

      const ext = this.getFileExtension(filename);
      const pattern = importPatterns[ext];
      
      if (pattern) {
        const matches = analysis.patch.match(pattern) || [];
        matches.forEach(match => {
          // Extract file path from import
          const importPath = this.extractImportPath(match, ext);
          if (importPath) {
            relatedFiles.add(importPath);
          }
        });
      }
    }

    return Array.from(relatedFiles).slice(0, 10); // Limit to 10 related files
  }

  /**
   * Build re-review context
   */
  buildReReviewContext(pullRequest) {
    const previousReviews = this.getPreviousReviews(pullRequest);
    
    if (previousReviews.length === 0) {
      return null;
    }

    const lastReview = previousReviews[0];
    const unresolvedIssues = lastReview.feedback.filter(
      feedback => feedback.type === 'issue' && feedback.severity !== 'low'
    );

    return {
      lastReviewDate: lastReview.createdAt,
      lastReviewSummary: lastReview.summary,
      totalIssuesFound: lastReview.feedback.length,
      unresolvedIssues: unresolvedIssues,
      metrics: lastReview.metrics,
    };
  }

  /**
   * Get file extension
   */
  getFileExtension(filename) {
    const parts = filename.split('.');
    if (parts.length > 1) {
      const ext = parts[parts.length - 1].toLowerCase();
      // Map common extensions
      const extMap = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        py: 'python',
        java: 'java',
        go: 'go',
        rb: 'ruby',
        php: 'php',
        cs: 'csharp',
        cpp: 'cpp',
        c: 'c',
      };
      return extMap[ext] || ext;
    }
    return 'unknown';
  }

  /**
   * Extract import path from import statement
   */
  extractImportPath(importStatement, language) {
    let match;
    
    switch (language) {
      case 'javascript':
      case 'typescript':
        match = importStatement.match(/['"]([^'"]+)['"]/);
        return match ? match[1] : null;
        
      case 'python':
        match = importStatement.match(/(?:from\s+(\S+)|import\s+(\S+))/);
        return match ? (match[1] || match[2]) : null;
        
      case 'java':
        match = importStatement.match(/import\s+([\w.]+);/);
        return match ? match[1].replace(/\./g, '/') : null;
        
      default:
        return null;
    }
  }
}

module.exports = ContextBuilder;