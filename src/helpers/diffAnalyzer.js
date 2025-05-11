// helpers/diffAnalyzer.js - Fixed to handle all lines, not just additions
const logger = require("../utils/logger");

class DiffAnalyzer {
  /**
   * Analyzes PR files and creates a mapping of line numbers
   */
  analyzePRFiles(files) {
    const analysis = {
      files: {},
      statistics: {
        totalFiles: files.length,
        totalAdditions: 0,
        totalDeletions: 0,
        totalChanges: 0,
      },
    };

    files.forEach((file) => {
      const fileAnalysis = this.analyzeFile(file);
      analysis.files[file.filename] = fileAnalysis;

      // Update statistics
      analysis.statistics.totalAdditions += file.additions;
      analysis.statistics.totalDeletions += file.deletions;
      analysis.statistics.totalChanges += file.changes;
    });

    return analysis;
  }

  /**
   * Analyzes a single file and creates line mapping
   */
  analyzeFile(file) {
    const analysis = {
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      lineMapping: {},
      hunks: [],
      patch: file.patch,
    };

    if (!file.patch) {
      return analysis;
    }

    // Parse the patch to create line mappings
    const hunks = this.parseHunks(file.patch);
    analysis.hunks = hunks;

    // Create a mapping for ALL visible lines in the new file
    hunks.forEach((hunk) => {
      analysis.lineMapping = {
        ...analysis.lineMapping,
        ...this.createLineMapping(hunk),
      };
    });

    return analysis;
  }

  /**
   * Parses hunks from a diff patch
   */
  parseHunks(patch) {
    const lines = patch.split("\n");
    const hunks = [];
    let currentHunk = null;

    lines.forEach((line, index) => {
      if (line.startsWith("@@")) {
        // Parse hunk header
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
          currentHunk = {
            oldStart: parseInt(match[1]),
            oldLines: parseInt(match[2] || "1"),
            newStart: parseInt(match[3]),
            newLines: parseInt(match[4] || "1"),
            headerLine: index,
            lines: [],
          };
          hunks.push(currentHunk);
        }
      } else if (currentHunk) {
        currentHunk.lines.push({
          content: line,
          type: this.getLineType(line),
          index: index,
        });
      }
    });

    return hunks;
  }

  /**
   * Creates a mapping from actual line numbers to diff positions
   * Now includes ALL lines (additions, deletions, and context)
   */
  createLineMapping(hunk) {
    const mapping = {};
    let currentOldLine = hunk.oldStart;
    let currentNewLine = hunk.newStart;
    let diffPosition = hunk.headerLine + 1;

    hunk.lines.forEach((line) => {
      if (line.type === "addition") {
        // New lines added in this version
        mapping[currentNewLine] = {
          diffPosition: diffPosition,
          type: "addition",
          content: line.content,
          oldLine: null,
        };
        currentNewLine++;
        diffPosition++;
      } else if (line.type === "deletion") {
        // Lines that were removed (we can still comment on the context around them)
        // These don't have a position in the new file
        currentOldLine++;
        diffPosition++;
      } else if (line.type === "context") {
        // Unchanged lines - we can comment on these too
        mapping[currentNewLine] = {
          diffPosition: diffPosition,
          type: "context",
          content: line.content,
          oldLine: currentOldLine,
        };
        currentOldLine++;
        currentNewLine++;
        diffPosition++;
      }
    });

    return mapping;
  }

  /**
   * Determines the type of a diff line
   */
  getLineType(line) {
    if (line.startsWith("+")) return "addition";
    if (line.startsWith("-")) return "deletion";
    if (line.startsWith(" ")) return "context";
    return "other";
  }

  /**
   * Finds the diff position for a specific line number
   * Now works for all lines, not just additions
   */
  findDiffPosition(fileAnalysis, lineNumber) {
    const lineData = fileAnalysis.lineMapping[lineNumber];

    if (!lineData) {
      // If we don't have an exact match, find the closest line we can comment on
      const availableLines = Object.keys(fileAnalysis.lineMapping)
        .map(Number)
        .sort((a, b) => a - b);
      const closestLine = availableLines.reduce((prev, curr) => {
        return Math.abs(curr - lineNumber) < Math.abs(prev - lineNumber)
          ? curr
          : prev;
      });

      if (closestLine) {
        logger.warn(
          `Line ${lineNumber} not in diff, using closest line ${closestLine}`
        );
        return fileAnalysis.lineMapping[closestLine].diffPosition;
      }

      logger.warn(
        `No suitable line found for ${lineNumber} in ${fileAnalysis.filename}`
      );
      return null;
    }

    return lineData.diffPosition;
  }

  /**
   * Gets the actual code at a specific line (for context)
   */
  getLineContent(fileAnalysis, lineNumber) {
    const lineData = fileAnalysis.lineMapping[lineNumber];

    if (!lineData) {
      return null;
    }

    // Remove the diff prefix (+, -, or space)
    return lineData.content.substring(1);
  }

  /**
   * Check if a line exists in the new version of the file
   */
  isLineInNewFile(fileAnalysis, lineNumber) {
    return !!fileAnalysis.lineMapping[lineNumber];
  }
}

module.exports = DiffAnalyzer;
