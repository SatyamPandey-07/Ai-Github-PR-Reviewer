const axios = require('axios');

class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseURL = 'https://api.github.com';
    this.headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    };
  }

  // Get user repositories
  async getUserRepos() {
    try {
      const response = await axios.get(`${this.baseURL}/user/repos`, {
        headers: this.headers,
        params: {
          sort: 'updated',
          direction: 'desc',
          per_page: 50
        }
      });

      return {
        success: true,
        repos: response.data.map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          owner: {
            login: repo.owner.login
          },
          description: repo.description,
          updated_at: repo.updated_at,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          forks_count: repo.forks_count,
          has_issues: repo.has_issues,
          open_issues_count: repo.open_issues_count
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get pull requests for a repository
  async getPullRequests(owner, repo) {
    try {
      const response = await axios.get(`${this.baseURL}/repos/${owner}/${repo}/pulls`, {
        headers: this.headers,
        params: {
          state: 'open',
          sort: 'updated',
          direction: 'desc'
        }
      });

      return {
        success: true,
        pulls: response.data.map(pr => ({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          user: pr.user.login,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          diff_url: pr.diff_url,
          patch_url: pr.patch_url,
          head: {
            ref: pr.head.ref,
            sha: pr.head.sha
          },
          base: {
            ref: pr.base.ref,
            sha: pr.base.sha
          }
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get pull request diff
  async getPullRequestDiff(owner, repo, prNumber) {
    try {
      const response = await axios.get(`${this.baseURL}/repos/${owner}/${repo}/pulls/${prNumber}`, {
        headers: {
          ...this.headers,
          'Accept': 'application/vnd.github.v3.diff'
        }
      });

      return {
        success: true,
        diff: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Post comment on pull request
  async postPullRequestComment(owner, repo, prNumber, comment) {
    try {
      const response = await axios.post(`${this.baseURL}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
        body: comment
      }, {
        headers: this.headers
      });

      return {
        success: true,
        comment: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get pull request files (for more detailed analysis)
  async getPullRequestFiles(owner, repo, prNumber) {
    try {
      const response = await axios.get(`${this.baseURL}/repos/${owner}/${repo}/pulls/${prNumber}/files`, {
        headers: this.headers
      });

      return {
        success: true,
        files: response.data.map(file => ({
          filename: file.filename,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          status: file.status,
          patch: file.patch,
          blob_url: file.blob_url
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GitHubAPI;