// openaiService.js - Working version without response_format
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
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo", // or "gpt-4"
        messages: [
          {
            role: "system",
            content:
              "You are an expert code reviewer. Analyze code changes and provide detailed feedback. Always respond with valid JSON format.",
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

      try {
        return JSON.parse(result);
      } catch (parseError) {
        logger.error("Error parsing OpenAI response as JSON", { parseError });

        // Try to extract JSON from text
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }

        return {
          summary: "Failed to parse response",
          comments: [],
          metrics: {},
          suggestions: [],
        };
      }
    } catch (error) {
      logger.error("Error calling OpenAI API", { error: error.message });
      throw error;
    }
  }
}

module.exports = new OpenAIService();
