const axios = require('axios');

class GitHubOAuth {
  constructor() {
    this.clientId = process.env.GITHUB_CLIENT_ID;
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET;
    this.redirectUri = process.env.REDIRECT_URI;
  }

  // Generate GitHub OAuth URL
  getAuthUrl() {
    const scope = 'repo,user:email';
    return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&scope=${scope}`;
  }

  // Exchange code for access token
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri
      }, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.data.access_token) {
        return {
          success: true,
          token: response.data.access_token,
          scope: response.data.scope,
          token_type: response.data.token_type
        };
      } else {
        return {
          success: false,
          error: response.data.error_description || 'Failed to get access token'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get user info with token
  async getUserInfo(token) {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return {
        success: true,
        user: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GitHubOAuth;