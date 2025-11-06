#!/usr/bin/env node

const inquirer = require('inquirer');
const axios = require('axios');
const open = require('open').default || require('open');
const errorHandler = require('./lib/error-handler');

class GitHubPRReviewerCLI {
  constructor() {
    this.baseURL = 'http://localhost:5000';
    this.sessionToken = null;
  }

  async start() {
    console.log('🤖 AI GitHub PR Reviewer CLI');
    console.log('===============================\n');

    try {
      // Check if server is running
      await this.checkServerStatus();
      
      // Check authentication
      const isAuthenticated = await this.checkAuthentication();
      
      if (!isAuthenticated) {
        await this.authenticate();
      }

      // Main menu loop
      await this.mainMenu();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }

  async checkServerStatus() {
    try {
      await axios.get(`${this.baseURL}/health`);
      console.log('✅ Server is running');
    } catch (error) {
      throw new Error('Server is not running. Please start the server with: npm start');
    }
  }

  async checkAuthentication() {
    // In a real CLI, you'd store the session token securely
    // For demo purposes, we'll just ask to authenticate each time
    return false;
  }

  async authenticate() {
    console.log('\n🔐 GitHub Authentication Required');
    
    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Open GitHub OAuth login in browser?',
      default: true
    }]);

    if (!proceed) {
      console.log('Authentication cancelled.');
      process.exit(0);
    }

    console.log('Opening GitHub OAuth page...');
    const authURL = `${this.baseURL}/auth/login`;
    
    try {
      await open(authURL);
      console.log('\n📝 After authenticating in the browser:');
      console.log('1. Copy the session token from the response');
      console.log('2. Paste it below\n');
      
      // In a real implementation, you'd handle the OAuth callback properly
      const { token } = await inquirer.prompt([{
        type: 'input',
        name: 'token',
        message: 'Enter your session token:',
        validate: input => input.length > 0 || 'Token is required'
      }]);
      
      this.sessionToken = token;
      console.log('✅ Authentication successful!\n');
      
    } catch (error) {
      throw new Error('Failed to open browser for authentication');
    }
  }

  async mainMenu() {
    while (true) {
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📂 List my repositories', value: 'listRepos' },
          { name: '🔍 Review a specific PR', value: 'reviewPR' },
          { name: '⚙️  Check Ollama status', value: 'checkOllama' },
          { name: '🚪 Exit', value: 'exit' }
        ]
      }]);

      switch (action) {
        case 'listRepos':
          await this.listRepositories();
          break;
        case 'reviewPR':
          await this.reviewPullRequest();
          break;
        case 'checkOllama':
          await this.checkOllamaStatus();
          break;
        case 'exit':
          console.log('👋 Goodbye!');
          process.exit(0);
      }
    }
  }

  async listRepositories() {
    try {
      console.log('\n📂 Fetching your repositories...');
      
      const response = await axios.get(`${this.baseURL}/api/repos`, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` }
      });

      const repos = response.data;
      
      if (repos.length === 0) {
        console.log('No repositories found.');
        return;
      }

      console.log(`\n✅ Found ${repos.length} repositories:\n`);
      
      repos.slice(0, 10).forEach((repo, index) => {
        console.log(`${index + 1}. ${repo.full_name}`);
        console.log(`   Language: ${repo.language || 'Unknown'}`);
        console.log(`   Updated: ${new Date(repo.updated_at).toLocaleDateString()}`);
        console.log(`   Open Issues: ${repo.open_issues_count}\n`);
      });

      if (repos.length > 10) {
        console.log(`... and ${repos.length - 10} more repositories.\n`);
      }

    } catch (error) {
      console.error(errorHandler.formatForCLI(error));
    }
  }

  async reviewPullRequest() {
    try {
      // Get repository info
      const { repoInput } = await inquirer.prompt([{
        type: 'input',
        name: 'repoInput',
        message: 'Enter repository (owner/repo):',
        validate: input => {
          if (!input.includes('/')) {
            return 'Please enter in format: owner/repo';
          }
          return true;
        }
      }]);

      const [owner, repo] = repoInput.split('/');

      // Fetch pull requests
      console.log('\n🔍 Fetching open pull requests...');
      
      const prResponse = await axios.get(`${this.baseURL}/api/repos/${owner}/${repo}/pulls`, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` }
      });

      const pulls = prResponse.data;

      if (pulls.length === 0) {
        console.log('No open pull requests found.');
        return;
      }

      // Select PR to review
      const prChoices = pulls.map(pr => ({
        name: `#${pr.number}: ${pr.title} (by ${pr.user})`,
        value: pr.number
      }));

      const { selectedPR } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedPR',
        message: 'Select a pull request to review:',
        choices: prChoices
      }]);

      // Analyze the PR
      console.log('\n🤖 Analyzing pull request with AI...');
      console.log('This may take a moment...\n');

      const analysisResponse = await axios.post(`${this.baseURL}/api/analyze-pr`, {
        owner,
        repo,
        prNumber: selectedPR
      }, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` }
      });

      const analysis = analysisResponse.data.analysis;

      // Display results
      console.log('🎯 AI Review Complete!\n');
      console.log('='.repeat(50));
      console.log(`PR: ${analysis.pr.title}`);
      console.log(`Author: ${analysis.pr.author}`);
      console.log(`Files Changed: ${analysis.pr.filesChanged}`);
      console.log(`Model: ${analysis.model}`);
      console.log('='.repeat(50));
      console.log('\n📝 AI Review:\n');
      console.log(analysis.review);
      console.log('\n' + '='.repeat(50));

      // Ask if user wants to post as comment
      const { postComment } = await inquirer.prompt([{
        type: 'confirm',
        name: 'postComment',
        message: 'Post this review as a comment on GitHub?',
        default: false
      }]);

      if (postComment) {
        await this.postReviewComment(owner, repo, selectedPR, analysis.review);
      }

    } catch (error) {
      if (error.response?.status === 503) {
        console.error('❌ Ollama Service Error:');
        console.error(error.response.data.error);
        if (error.response.data.suggestion) {
          console.error('💡 Suggestion:', error.response.data.suggestion);
        }
      } else {
        console.error('❌ Failed to analyze PR:', error.response?.data?.error || error.message);
      }
    }
  }

  async postReviewComment(owner, repo, prNumber, review) {
    try {
      console.log('\n📤 Posting review comment...');

      const response = await axios.post(`${this.baseURL}/api/post-review`, {
        owner,
        repo,
        prNumber,
        review
      }, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` }
      });

      const comment = response.data.comment;
      console.log('✅ Review posted successfully!');
      console.log(`🔗 Comment URL: ${comment.url}`);

    } catch (error) {
      console.error('❌ Failed to post comment:', error.response?.data?.error || error.message);
    }
  }

  async checkOllamaStatus() {
    try {
      console.log('\n⚙️  Checking Ollama status...');

      const response = await axios.get(`${this.baseURL}/api/ollama/status`);
      const status = response.data;

      if (status.running) {
        console.log('✅ Ollama is running');
        console.log(`🤖 Model available: ${status.modelAvailable ? 'Yes' : 'No'}`);
        
        if (status.availableModels && status.availableModels.length > 0) {
          console.log('\n📋 Available models:');
          status.availableModels.forEach(model => {
            console.log(`  - ${model}`);
          });
        }
      } else {
        console.log('❌ Ollama is not running');
        console.log('💡 Start Ollama with: ollama serve');
      }

    } catch (error) {
      console.error('❌ Failed to check Ollama status:', error.response?.data?.error || error.message);
    }
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new GitHubPRReviewerCLI();
  cli.start().catch(error => {
    console.error('❌ CLI Error:', error.message);
    process.exit(1);
  });
}

module.exports = GitHubPRReviewerCLI;