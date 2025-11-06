class ErrorHandler {
  constructor() {
    this.errors = {
      GITHUB_AUTH: 'GitHub authentication failed',
      OLLAMA_DOWN: 'Ollama service is not running',
      MODEL_MISSING: 'AI model is not available',
      RATE_LIMIT: 'GitHub API rate limit exceeded',
      INVALID_REPO: 'Repository not found or access denied',
      INVALID_PR: 'Pull request not found',
      NETWORK_ERROR: 'Network connection failed'
    };
  }

  // Handle different types of errors with specific messages
  handle(error, context = '') {
    console.error(`❌ Error ${context ? `in ${context}` : ''}:`, error.message);

    // GitHub API errors
    if (error.response && error.response.status) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          return this.createError('GITHUB_AUTH', 'Invalid or expired GitHub token. Please re-authenticate.');
        case 403:
          if (data.message && data.message.includes('rate limit')) {
            return this.createError('RATE_LIMIT', `${data.message}. Try again later.`);
          }
          return this.createError('INVALID_REPO', 'Access denied or repository not found.');
        case 404:
          return this.createError('INVALID_PR', 'Pull request or repository not found.');
        case 422:
          return this.createError('INVALID_REPO', `GitHub API error: ${data.message || 'Invalid request'}`);
        default:
          return this.createError('NETWORK_ERROR', `GitHub API error (${status}): ${data.message || 'Unknown error'}`);
      }
    }

    // Ollama errors
    if (error.code === 'ECONNREFUSED' && error.address === '127.0.0.1') {
      if (error.port === 11434) {
        return this.createError('OLLAMA_DOWN', 'Ollama is not running. Start with: ollama serve');
      }
      if (error.port === 5000) {
        return this.createError('NETWORK_ERROR', 'Server is not running. Start with: npm start');
      }
    }

    // Network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return this.createError('NETWORK_ERROR', 'Network connection failed. Check your internet connection.');
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return this.createError('NETWORK_ERROR', 'Request timed out. Please try again.');
    }

    // Generic error
    return {
      type: 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred',
      suggestion: 'Please check the logs for more details'
    };
  }

  createError(type, message, suggestion = null) {
    const errorInfo = {
      type,
      message,
      suggestion: suggestion || this.getSuggestion(type)
    };

    return errorInfo;
  }

  getSuggestion(type) {
    const suggestions = {
      GITHUB_AUTH: 'Visit http://localhost:5000/auth/login to re-authenticate',
      OLLAMA_DOWN: 'Run: ollama serve',
      MODEL_MISSING: 'Run: ollama pull gemma:2b (or your preferred model)',
      RATE_LIMIT: 'Wait for the rate limit to reset, or use a personal access token',
      INVALID_REPO: 'Check the repository name and your access permissions',
      INVALID_PR: 'Verify the pull request number exists',
      NETWORK_ERROR: 'Check your internet connection and try again'
    };

    return suggestions[type] || 'Please check the documentation for troubleshooting';
  }

  // Format error for CLI display
  formatForCLI(error) {
    const errorInfo = this.handle(error);
    
    let output = `❌ ${errorInfo.message}`;
    if (errorInfo.suggestion) {
      output += `\n💡 ${errorInfo.suggestion}`;
    }
    
    return output;
  }

  // Format error for API response
  formatForAPI(error) {
    const errorInfo = this.handle(error);
    
    return {
      error: errorInfo.message,
      type: errorInfo.type,
      suggestion: errorInfo.suggestion
    };
  }

  // Log error with context
  log(error, context = '', level = 'error') {
    const timestamp = new Date().toISOString();
    const prefix = level.toUpperCase();
    
    console.log(`[${timestamp}] ${prefix} ${context ? `[${context}]` : ''}: ${error.message}`);
    
    if (error.stack && process.env.DEBUG === 'true') {
      console.log('Stack trace:', error.stack);
    }
  }
}

module.exports = new ErrorHandler();