// helpers/promptBuilder.js - Updated with correct line number instructions
const logger = require("../utils/logger");

class PromptBuilder {
  constructor() {
    // Token limits for different models
    this.tokenLimits = {
      "gpt-3.5-turbo": 4096,
      "gpt-4": 8192,
      "gpt-4-32k": 32768,
    };
  }

  /**
   * Builds an optimized prompt that fits within token limits
   */
  buildPrompt(prData, pullRequest, isReReview) {
    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
    const maxTokens = this.tokenLimits[model] || 4096;

    // Start with essential sections
    let prompt = this.buildEssentialPrompt(pullRequest, prData, isReReview);

    // Add files based on priority and token budget
    const filePrompt = this.buildFileAnalysis(
      prData.diffAnalysis,
      maxTokens - this.estimateTokens(prompt)
    );
    prompt += filePrompt;

    // Add response format
    prompt += this.buildResponseFormat();

    logger.info(
      `Built prompt with estimated ${this.estimateTokens(
        prompt
      )} tokens for model ${model}`
    );
    return prompt;
  }

  /**
   * Build essential prompt sections with better severity guidance
   */
  buildEssentialPrompt(pullRequest, prData, isReReview) {
    return `You are a senior software engineer reviewing code. Be precise and helpful.

PR: ${pullRequest.title}
Description: ${pullRequest.description?.substring(0, 200) || "None"}
Changes: ${prData.diffAnalysis.statistics.totalFiles} files, +${
      prData.diffAnalysis.statistics.totalAdditions
    } -${prData.diffAnalysis.statistics.totalDeletions}

${
  isReReview
    ? "This is a RE-REVIEW. Check if previous issues were fixed.\n"
    : ""
}

CRITICAL: HOW TO READ DIFFS AND COUNT LINE NUMBERS:
1. The @@ header shows where lines start: "@@ -old,count +new,count @@"
2. The number after + in @@ is the starting line number
3. Lines with + are additions (count these)
4. Lines with - are deletions (skip these)
5. Lines with no prefix are context (count these)
6. Count from the @@ header to find the actual line number

Example:
@@ -1,3 +1,5 @@
+import { useState } from "react";    // Line 1
+import { api } from "./api";        // Line 2
 
 function Component() {              // Line 4 (not 3!)
+  const data = api.get('/data');   // Line 5

SEVERITY GUIDELINES:
- critical: Security vulnerabilities, data loss risks, crashes
- high: Major bugs, performance issues (O(n²)), memory leaks
- medium: Missing error handling, code duplication, poor practices
- low: Style issues, minor optimizations, naming conventions

REVIEW FOCUS:
1. Security issues (SQL injection, XSS, exposed secrets)
2. Bugs and logic errors
3. Performance problems
4. Error handling
5. Best practices

IMPORTANT:
- Use the EXACT line number where the issue occurs
- Count carefully from the @@ header
- Always provide specific code examples in suggestions
`;
  }

  /**
   * Build file analysis section with better line context
   */
  buildFileAnalysis(diffAnalysis, tokenBudget) {
    let fileSection = "\nFILE CHANGES:\n";
    const files = Object.entries(diffAnalysis.files);

    // Sort files by importance (most changes first)
    files.sort(([, a], [, b]) => b.changes - a.changes);

    for (const [filename, analysis] of files) {
      // Skip if we're running out of tokens
      if (this.estimateTokens(fileSection) > tokenBudget * 0.8) {
        fileSection += "\n... (additional files omitted due to length)";
        break;
      }

      fileSection += this.buildFileSection(filename, analysis);
    }

    return fileSection;
  }

  /**
   * Build a single file section with line number guide
   */
  buildFileSection(filename, analysis) {
    let section = `\n${filename} (+${analysis.additions} -${analysis.deletions}):\n`;

    if (analysis.patch) {
      // Include the full patch for context
      const maxPatchLength = 1000;
      const patch =
        analysis.patch.length > maxPatchLength
          ? analysis.patch.substring(0, maxPatchLength) + "\n... (truncated)"
          : analysis.patch;

      section += `\`\`\`diff\n${patch}\n\`\`\`\n`;

      // Add line number reference
      section += this.createLineNumberReference(analysis.patch);
    }

    return section;
  }

  /**
   * Create a line number reference for the file
   */
  createLineNumberReference(patch) {
    let reference = "Line number reference:\n";
    const lines = patch.split("\n");
    let currentLine = 0;
    let importantLines = [];

    lines.forEach((line, index) => {
      if (line.startsWith("@@")) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          currentLine = parseInt(match[1]) - 1;
          reference += `- New code section starts at line ${match[1]}\n`;
        }
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        currentLine++;
        // Track important lines that might have issues
        if (
          line.includes("api") ||
          line.includes("fetch") ||
          line.includes("await") ||
          line.includes("async") ||
          line.includes(".get") ||
          line.includes(".post")
        ) {
          importantLines.push({
            line: currentLine,
            code: line.substring(1).trim(),
          });
        }
      } else if (!line.startsWith("-")) {
        currentLine++;
      }
    });

    // Show a few important lines to help with line counting
    if (importantLines.length > 0) {
      reference += "Key lines to review:\n";
      importantLines.slice(0, 5).forEach(({ line, code }) => {
        reference += `- Line ${line}: ${code.substring(0, 40)}...\n`;
      });
    }

    return reference;
  }

  /**
   * Build response format with better examples
   */
  buildResponseFormat() {
    return `

RESPONSE FORMAT (JSON):
{
  "summary": "Concise summary of findings",
  "comments": [
    {
      "file": "exact/file/path.js",
      "line": <EXACT line number from the file>,
      "type": "issue",
      "severity": "critical|high|medium|low",
      "comment": "Clear description of the issue",
      "suggestion": "Specific code example showing how to fix it"
    }
  ],
  "metrics": {
    "security": <1-10>,
    "performance": <1-10>,
    "maintainability": <1-10>,
    "readability": <1-10>
  }
}

LINE COUNTING EXAMPLE:
If you see this diff:
\`\`\`diff
@@ -1,3 +1,30 @@
+import { useState, useEffect } from "react";
+
 function Dashboard() {
+  const [stats, setStats] = useState(null);
+  
+  useEffect(() => {
+    api.get('/dashboard/stats')
+      .then(response => {
+        setStats(response.data);
+      });
+  }, []);
\`\`\`

The api.get call is at line 7 (NOT line 6 or any other number).
Count: Line 1 (import), Line 2 (blank), Line 3 (function), Line 4 (useState), Line 5 (blank), Line 6 (useEffect), Line 7 (api.get)

COMMENT EXAMPLES:

1. Error Handling (for the example above):
{
  "file": "src/pages/Dashboard.js",
  "line": 7,
  "type": "issue",
  "severity": "medium",
  "comment": "Missing error handling for API call",
  "suggestion": "try {\n  const response = await api.get('/dashboard/stats');\n  setStats(response.data);\n} catch (error) {\n  console.error('Failed to fetch stats:', error);\n  // Handle error state\n}"
}

CRITICAL REMINDERS:
- Use the EXACT line number where the code appears
- Count ALL lines including blanks and context lines
- If the issue is on line 28, say line 28, not line 1
- Double-check your line counting from the @@ header`;
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Build prompt for large PRs (split into chunks)
   */
  buildChunkedPrompt(prData, pullRequest, isReReview, chunkIndex, totalChunks) {
    const files = Object.entries(prData.diffAnalysis.files);
    const filesPerChunk = Math.ceil(files.length / totalChunks);
    const startIndex = chunkIndex * filesPerChunk;
    const endIndex = Math.min(startIndex + filesPerChunk, files.length);

    const chunkFiles = files.slice(startIndex, endIndex);

    // Create a modified diffAnalysis with only the chunk files
    const chunkDiffAnalysis = {
      ...prData.diffAnalysis,
      files: Object.fromEntries(chunkFiles),
      statistics: {
        ...prData.diffAnalysis.statistics,
        totalFiles: chunkFiles.length,
      },
    };

    let prompt = `Reviewing chunk ${chunkIndex + 1} of ${totalChunks} for PR: ${
      pullRequest.title
    }\n\n`;
    prompt += this.buildEssentialPrompt(
      pullRequest,
      { ...prData, diffAnalysis: chunkDiffAnalysis },
      isReReview
    );
    prompt += this.buildFileAnalysis(chunkDiffAnalysis, 3000);
    prompt += this.buildResponseFormat();

    return prompt;
  }

  /**
   * Determine if PR needs chunking
   */
  needsChunking(prData) {
    const estimatedTokens = this.estimateFullPromptTokens(prData);
    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
    const limit = this.tokenLimits[model] || 4096;

    return estimatedTokens > limit * 0.8;
  }

  /**
   * Estimate tokens for full prompt
   */
  estimateFullPromptTokens(prData) {
    let totalChars = 0;

    // Count characters in all patches
    Object.values(prData.diffAnalysis.files).forEach((file) => {
      if (file.patch) {
        totalChars += file.patch.length;
      }
    });

    // Add overhead for structure and formatting
    totalChars += 2000;

    return Math.ceil(totalChars / 4);
  }
}

module.exports = PromptBuilder;
