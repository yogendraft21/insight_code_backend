/**
 * AI Review Service
 * Handles code review using OpenAI
 */
const OpenAI = require('openai');
const { openai } = require('../config/env');
const logger = require('../utils/logger');

class AIReviewService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: openai.apiKey
    });
  }

  /**
   * Generate code review for pull request files
   * @param {Array} files - Array of file objects with path, content, and diff
   * @param {string} prTitle - Pull request title
   * @param {string} prDescription - Pull request description
   * @returns {Object} Review data with comments and summary
   */
  async reviewCode(files, prTitle, prDescription) {
    try {
      const reviewPrompt = this.buildReviewPrompt(files, prTitle, prDescription);
      
      // Track start time for logging
      const startTime = Date.now();
      
      // Call OpenAI API
      const response = await this.openai.chat.completions.create({
        model: openai.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert code reviewer. Analyze the code changes and provide helpful, specific feedback. 
            Focus on potential bugs, security issues, performance improvements, and best practices.
            Be constructive and include code examples when suggesting improvements.`
          },
          { role: 'user', content: reviewPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });
      
      const elapsedTime = Date.now() - startTime;
      logger.info(`AI review completed in ${elapsedTime}ms`);
      
      // Parse the response to extract feedback
      return this.parseReviewResponse(response.choices[0].message.content);
    } catch (error) {
      logger.error('AI review error', { error: error.message });
      throw new Error(`AI review failed: ${error.message}`);
    }
  }

  /**
   * Build prompt for AI review
   * @param {Array} files - Array of file objects
   * @param {string} prTitle - Pull request title
   * @param {string} prDescription - Pull request description
   * @returns {string} Review prompt
   */
  buildReviewPrompt(files, prTitle, prDescription) {
    let prompt = `Review the following pull request:\n\n`;
    prompt += `Title: ${prTitle}\n`;
    prompt += `Description: ${prDescription || 'No description provided'}\n\n`;
    prompt += `Files changed:\n\n`;
    
    files.forEach(file => {
      prompt += `File: ${file.path}\n`;
      prompt += `Diff:\n${file.diff}\n\n`;
      
      if (file.content) {
        prompt += `Current content:\n${file.content}\n\n`;
      }
    });
    
    prompt += `Provide a code review with the following format:
1. Overall summary of the changes
2. Specific feedback for each file with line numbers
3. Suggestions for improvements
4. Any potential issues or bugs
5. Code quality assessment

Be specific and constructive. Include code examples for suggestions when possible.`;
    
    return prompt;
  }

  /**
   * Parse AI response into structured review data
   * @param {string} response - AI response text
   * @returns {Object} Structured review data
   */
  parseReviewResponse(response) {
    // Extract overall summary (everything before the first file-specific heading)
    const summaryMatch = response.match(/^([\s\S]*?)(?=##|\n#)/);
    const summary = summaryMatch ? summaryMatch[0].trim() : response;
    
    // Extract file-specific comments
    const fileCommentRegex = /(?:File|In) `?([^:`\n]+)`?:|^#+\s+([^:\n]+):/gm;
    const fileMatches = [...response.matchAll(fileCommentRegex)];
    
    const feedback = [];
    
    // Process file feedback with line number detection
    fileMatches.forEach((match, index) => {
      const filePath = match[1] || match[2];
      
      // Get content for this file (until next file section or end)
      const nextMatch = fileMatches[index + 1];
      const fileContent = nextMatch 
        ? response.substring(match.index, nextMatch.index) 
        : response.substring(match.index);
      
      // Find line-specific comments
      const lineCommentRegex = /(?:line|L)(?:ine)? (\d+)[\s:]+(.*?)(?=\n(?:line|L|\n|$))/gis;
      const lineMatches = [...fileContent.matchAll(lineCommentRegex)];
      
      lineMatches.forEach(lineMatch => {
        const line = parseInt(lineMatch[1], 10);
        const comment = lineMatch[2].trim();
        
        // Determine comment type based on content
        let type = 'suggestion';
        if (comment.toLowerCase().includes('error') || comment.toLowerCase().includes('bug')) {
          type = 'issue';
        } else if (comment.toLowerCase().includes('good') || comment.toLowerCase().includes('well done')) {
          type = 'praise';
        } else if (comment.includes('?')) {
          type = 'question';
        }
        
        // Determine severity based on content
        let severity = 'medium';
        if (comment.toLowerCase().includes('critical') || comment.toLowerCase().includes('major')) {
          severity = 'high';
        } else if (comment.toLowerCase().includes('minor') || comment.toLowerCase().includes('suggestion')) {
          severity = 'low';
        }
        
        feedback.push({
          path: filePath,
          line,
          comment,
          type,
          severity
        });
      });
    });
    
    // Generate metrics based on AI feedback
    const metrics = this.generateMetrics(response);
    
    return {
      summary,
      feedback,
      metrics
    };
  }

  /**
   * Generate code quality metrics from AI response
   * @param {string} response - AI response text
   * @returns {Object} Code quality metrics
   */
  generateMetrics(response) {
    // Simple heuristics to generate metrics based on response content
    const metrics = {
      codeQualityScore: 0,
      complexity: 0,
      readability: 0,
      maintainability: 0,
      securityScore: 0
    };
    
    // Count positive vs negative indicators
    const positiveTerms = ['good', 'well', 'clean', 'excellent', 'great'];
    const negativeTerms = ['issue', 'problem', 'bug', 'error', 'fix', 'concern'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveTerms.forEach(term => {
      const matches = response.match(new RegExp(term, 'gi'));
      if (matches) positiveCount += matches.length;
    });
    
    negativeTerms.forEach(term => {
      const matches = response.match(new RegExp(term, 'gi'));
      if (matches) negativeCount += matches.length;
    });
    
    // Calculate base score from 0-10 based on positive/negative ratio
    const total = positiveCount + negativeCount;
    const baseScore = total > 0 ? Math.round((positiveCount / total) * 10) : 5;
    
    // Assign scores based on the base score
    metrics.codeQualityScore = baseScore;
    
    // Look for specific mentions to adjust other scores
    metrics.complexity = response.match(/complex|complicated/gi) ? baseScore - 2 : baseScore;
    metrics.readability = response.match(/readable|clear|understandable/gi) ? baseScore + 1 : baseScore;
    metrics.maintainability = response.match(/maintainable|extensible|modular/gi) ? baseScore + 1 : baseScore;
    metrics.securityScore = response.match(/secure|vulnerability|exploit/gi) ? baseScore - 2 : baseScore;
    
    // Ensure all scores are within 0-10 range
    Object.keys(metrics).forEach(key => {
      metrics[key] = Math.max(0, Math.min(10, metrics[key]));
    });
    
    return metrics;
  }
}

module.exports = new AIReviewService();