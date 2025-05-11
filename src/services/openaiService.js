// openaiService.js - Fixed version compatible with GPT-3.5
const OpenAI = require("openai");
const logger = require("../utils/logger");

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeCode(prompt) {
    try {
      // Detect model from environment or use default
      const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
      
      // Check if model supports JSON mode
      const supportsJsonMode = model.includes("gpt-4") || model.includes("gpt-3.5-turbo-1106");
      
      const messages = [
        {
          role: "system",
          content: this.getSystemPrompt(supportsJsonMode),
        },
        {
          role: "user",
          content: prompt,
        },
      ];

      // Prepare request options
      const requestOptions = {
        model: model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 4000,
      };

      // Only add response_format for models that support it
      if (supportsJsonMode) {
        requestOptions.response_format = { type: "json_object" };
      }

      const response = await this.openai.chat.completions.create(requestOptions);
      const result = response.choices[0].message.content;

      try {
        return JSON.parse(result);
      } catch (parseError) {
        logger.error("Error parsing OpenAI response as JSON", { 
          error: parseError.message,
          response: result.substring(0, 500)
        });

        // Try to extract JSON from the response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }

        // Return structured error response
        return this.getDefaultResponse("Failed to parse AI response");
      }
    } catch (error) {
      logger.error("Error calling OpenAI API", { 
        error: error.message,
        stack: error.stack
      });
      
      // Check for specific errors
      if (error.status === 429) {
        throw new Error("OpenAI rate limit exceeded. Please try again later.");
      }
      
      if (error.status === 400 && error.message.includes("response_format")) {
        // Retry without response_format
        return this.analyzeCodeWithoutJsonMode(prompt);
      }
      
      throw error;
    }
  }

  async analyzeCodeWithoutJsonMode(prompt) {
    try {
      logger.info("Retrying without JSON mode due to model limitations");
      
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt(false),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const result = response.choices[0].message.content;

      // Parse the response
      try {
        return JSON.parse(result);
      } catch (parseError) {
        // Extract JSON from response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        
        return this.getDefaultResponse("Failed to parse AI response");
      }
    } catch (error) {
      logger.error("Error in fallback OpenAI call", { error: error.message });
      throw error;
    }
  }

  getSystemPrompt(supportsJsonMode) {
    const basePrompt = `You are an expert code reviewer with 15+ years of experience. Analyze code changes and provide detailed feedback as a senior software engineer would.

Your expertise includes:
- Security vulnerabilities and best practices
- Performance optimization
- Code architecture and design patterns
- Error handling and edge cases
- Code maintainability and readability

Provide constructive, actionable feedback that helps developers improve.`;

    if (supportsJsonMode) {
      return basePrompt + "\n\nIMPORTANT: You must respond with valid JSON that matches the schema provided in the user prompt.";
    } else {
      return basePrompt + `\n\nIMPORTANT: You must respond ONLY with valid JSON that matches the schema provided. Do not include any text before or after the JSON. Start your response with '{' and end with '}'. Make sure the JSON is properly formatted and valid.`;
    }
  }

  getDefaultResponse(errorMessage = "AI analysis failed") {
    return {
      summary: errorMessage,
      comments: [],
      metrics: {
        readability: 5,
        maintainability: 5,
        security: 5,
        performance: 5,
        testCoverage: 5,
        architecturalQuality: 5,
      },
      overallAssessment: {
        verdict: "needs_discussion",
        reasoning: "Unable to complete full analysis",
        positiveAspects: [],
        mainConcerns: [errorMessage],
        learningOpportunities: [],
      },
    };
  }

  /**
   * Validate and clean JSON response
   */
  validateJsonResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response format');
    }

    // Ensure required fields exist
    const validated = {
      summary: response.summary || "Code review completed",
      comments: Array.isArray(response.comments) ? response.comments : [],
      metrics: response.metrics || {},
      overallAssessment: response.overallAssessment || {}
    };

    // Validate each comment
    validated.comments = validated.comments
      .filter(comment => comment && comment.file && comment.line)
      .map(comment => ({
        file: comment.file,
        line: parseInt(comment.line) || 0,
        type: comment.type || 'suggestion',
        severity: comment.severity || 'medium',
        category: comment.category || 'general',
        comment: comment.comment || '',
        suggestion: comment.suggestion,
        context: comment.context
      }));

    return validated;
  }

  /**
   * Retry mechanism with exponential backoff
   */
  async analyzeCodeWithRetry(prompt, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.analyzeCode(prompt);
        return this.validateJsonResponse(response);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`OpenAI API attempt ${attempt + 1} failed, retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    logger.error("All OpenAI API attempts failed", { error: lastError.message });
    return this.getDefaultResponse("Failed after multiple attempts");
  }
}

module.exports = new OpenAIService();