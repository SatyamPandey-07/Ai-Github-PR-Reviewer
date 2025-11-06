const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class OllamaLLM {
  constructor() {
    this.baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'gemma:2b';
  }

  // Check if Ollama is running and model is available
  async checkOllamaStatus() {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`);
      const models = response.data.models || [];
      const modelExists = models.some(m => m.name.includes(this.model.split(':')[0]));
      
      return {
        running: true,
        modelAvailable: modelExists,
        availableModels: models.map(m => m.name)
      };
    } catch (error) {
      return {
        running: false,
        modelAvailable: false,
        error: error.message
      };
    }
  }

  // Generate AI review using Ollama API
  async generateReview(diffText, prContext = {}) {
    try {
      const prompt = this.buildReviewPrompt(diffText, prContext);
      
      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: 1000
        }
      });

      if (response.data && response.data.response) {
        return {
          success: true,
          review: response.data.response.trim(),
          model: this.model
        };
      } else {
        return {
          success: false,
          error: 'No response from Ollama'
        };
      }
    } catch (error) {
      // Fallback to CLI if API fails
      return await this.generateReviewCLI(diffText, prContext);
    }
  }

  // Fallback: Generate review using Ollama CLI
  async generateReviewCLI(diffText, prContext = {}) {
    try {
      const prompt = this.buildReviewPrompt(diffText, prContext);
      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
      
      const command = `ollama run ${this.model} "${escapedPrompt}"`;
      const { stdout, stderr } = await execAsync(command, { 
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      if (stderr && !stdout) {
        return {
          success: false,
          error: stderr
        };
      }

      return {
        success: true,
        review: stdout.trim(),
        model: this.model,
        method: 'CLI'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Build comprehensive review prompt
  buildReviewPrompt(diffText, prContext) {
    const { title = '', description = '', author = '' } = prContext;
    
    return `You are a senior software engineer conducting a code review. Analyze this GitHub Pull Request and provide a comprehensive review.

**Pull Request Context:**
- Title: ${title}
- Author: ${author}
- Description: ${description}

**Code Changes:**
\`\`\`diff
${diffText.length > 8000 ? diffText.substring(0, 8000) + '\n... (truncated)' : diffText}
\`\`\`

**Review Guidelines:**
1. Identify potential bugs, security issues, or performance problems
2. Check for code quality and best practices
3. Look for proper error handling and edge cases
4. Evaluate code readability and maintainability
5. Suggest improvements or optimizations

**Please provide your review in the following format:**

## 🔍 Code Review Summary

### ✅ Positive Aspects
- [List what's done well]

### ⚠️ Issues Found
- [List any problems, bugs, or concerns]

### 💡 Suggestions
- [List improvements and recommendations]

### 🎯 Overall Assessment
[Brief overall evaluation and recommendation]

Keep your review constructive, specific, and actionable. Focus on the most important issues first.`;
  }

  // Analyze specific code patterns
  async analyzeCodePatterns(files) {
    try {
      const patterns = files.map(file => ({
        filename: file.filename,
        language: this.detectLanguage(file.filename),
        changes: file.changes,
        additions: file.additions,
        deletions: file.deletions
      }));

      const prompt = `Analyze these code changes for common patterns and potential issues:

${JSON.stringify(patterns, null, 2)}

Focus on:
1. Security vulnerabilities
2. Performance issues
3. Code smells
4. Best practice violations
5. Potential bugs

Provide a brief summary of findings.`;

      return await this.generateReview(prompt, {});
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Detect programming language from filename
  detectLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const languageMap = {
      'js': 'JavaScript',
      'ts': 'TypeScript',
      'jsx': 'React JSX',
      'tsx': 'React TSX',
      'py': 'Python',
      'java': 'Java',
      'cpp': 'C++',
      'c': 'C',
      'cs': 'C#',
      'php': 'PHP',
      'rb': 'Ruby',
      'go': 'Go',
      'rs': 'Rust',
      'kt': 'Kotlin',
      'swift': 'Swift'
    };
    return languageMap[ext] || 'Unknown';
  }
}

module.exports = OllamaLLM;