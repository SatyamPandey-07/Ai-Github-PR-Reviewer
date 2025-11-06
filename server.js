const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const GitHubOAuth = require('./lib/github-oauth');
const GitHubAPI = require('./lib/github-api');
const OllamaLLM = require('./lib/ollama-llm');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize services
const githubOAuth = new GitHubOAuth();
const ollamaLLM = new OllamaLLM();

// In-memory session storage (use Redis/database in production)
const sessions = new Map();

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'AI GitHub PR Reviewer server is running',
    timestamp: new Date().toISOString()
  });
});

// GitHub OAuth routes
app.get('/auth/login', (req, res) => {
  const authUrl = githubOAuth.getAuthUrl();
  res.redirect(authUrl);
});

app.get('/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code not provided' });
  }

  try {
    // Exchange code for token
    const tokenResult = await githubOAuth.exchangeCodeForToken(code);
    
    if (!tokenResult.success) {
      return res.status(400).json({ error: tokenResult.error });
    }

    // Get user info
    const userResult = await githubOAuth.getUserInfo(tokenResult.token);
    
    if (!userResult.success) {
      return res.status(400).json({ error: userResult.error });
    }

    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessions.set(sessionId, {
      token: tokenResult.token,
      user: userResult.user,
      createdAt: new Date()
    });

    // Store session in cookie (use secure cookies in production)
    res.cookie('session_id', sessionId, { 
      httpOnly: true, 
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.redirect('/dashboard');

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  const sessionId = req.cookies?.session_id || req.headers.authorization?.replace('Bearer ', '');
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const session = sessions.get(sessionId);
  req.user = session.user;
  req.token = session.token;
  next();
};

// Dashboard route
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API routes
app.get('/api/repos', requireAuth, async (req, res) => {
  try {
    console.log('📍 Fetching repos for user:', req.user.login);
    const githubAPI = new GitHubAPI(req.token);
    const result = await githubAPI.getUserRepos();
    
    console.log('📊 GitHub API result:', { 
      success: result.success, 
      repoCount: result.repos?.length || 0,
      error: result.error 
    });
    
    if (result.success) {
      res.json({
        success: true,
        repos: result.repos
      });
    } else {
      console.error('❌ GitHub API error:', result.error);
      res.status(500).json({ 
        success: false,
        error: result.error 
      });
    }
  } catch (error) {
    console.error('❌ Get repos error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch repositories' 
    });
  }
});

app.get('/api/repos/:owner/:repo/pulls', requireAuth, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    console.log(`📍 Fetching PRs for ${owner}/${repo}`);
    
    const githubAPI = new GitHubAPI(req.token);
    const result = await githubAPI.getPullRequests(owner, repo);
    
    console.log('📊 GitHub PRs result:', { 
      success: result.success, 
      pullCount: result.pulls?.length || 0,
      error: result.error 
    });
    
    if (result.success) {
      res.json({
        success: true,
        pulls: result.pulls
      });
    } else {
      console.error('❌ GitHub PRs error:', result.error);
      res.status(500).json({ 
        success: false,
        error: result.error 
      });
    }
  } catch (error) {
    console.error('❌ Get PRs error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch pull requests' 
    });
  }
});

app.post('/api/analyze-pr', requireAuth, async (req, res) => {
  try {
    const { owner, repo, prNumber } = req.body;
    
    if (!owner || !repo || !prNumber) {
      return res.status(400).json({ error: 'Missing required parameters: owner, repo, prNumber' });
    }

    const githubAPI = new GitHubAPI(req.token);
    
    // Get PR details
    const prResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
      headers: githubAPI.headers
    });
    const prData = prResponse.data;
    
    // Get PR diff
    const diffResult = await githubAPI.getPullRequestDiff(owner, repo, prNumber);
    if (!diffResult.success) {
      return res.status(500).json({ error: diffResult.error });
    }

    // Get PR files for additional context
    const filesResult = await githubAPI.getPullRequestFiles(owner, repo, prNumber);
    
    // Check Ollama status
    const ollamaStatus = await ollamaLLM.checkOllamaStatus();
    if (!ollamaStatus.running) {
      return res.status(503).json({ 
        error: 'Ollama is not running. Please start Ollama service.',
        suggestion: 'Run: ollama serve'
      });
    }

    if (!ollamaStatus.modelAvailable) {
      return res.status(503).json({ 
        error: `Model ${ollamaLLM.model} is not available.`,
        suggestion: `Run: ollama pull ${ollamaLLM.model}`,
        availableModels: ollamaStatus.availableModels
      });
    }

    // Generate AI review
    const prContext = {
      title: prData.title,
      description: prData.body || '',
      author: prData.user.login
    };

    const reviewResult = await ollamaLLM.generateReview(diffResult.diff, prContext);
    
    if (!reviewResult.success) {
      return res.status(500).json({ error: `AI analysis failed: ${reviewResult.error}` });
    }

    res.json({
      success: true,
      analysis: {
        pr: {
          title: prData.title,
          author: prData.user.login,
          url: prData.html_url,
          filesChanged: filesResult.success ? filesResult.files.length : 0
        },
        review: reviewResult.review,
        model: reviewResult.model,
        method: reviewResult.method || 'API'
      }
    });

  } catch (error) {
    console.error('Analyze PR error:', error);
    res.status(500).json({ error: 'Failed to analyze pull request' });
  }
});

// Ollama status endpoint
app.get('/api/ollama/status', async (req, res) => {
  try {
    const status = await ollamaLLM.checkOllamaStatus();
    res.json(status);
  } catch (error) {
    console.error('Ollama status error:', error);
    res.status(500).json({ 
      running: false, 
      error: error.message 
    });
  }
});

// Post review comment endpoint
app.post('/api/post-review', requireAuth, async (req, res) => {
  try {
    const { owner, repo, prNumber, body, review } = req.body;
    const reviewText = body || review; // Accept either 'body' or 'review' parameter
    
    console.log('📝 Posting review:', { owner, repo, prNumber, hasReview: !!reviewText });
    
    if (!owner || !repo || !prNumber || !reviewText) {
      console.error('❌ Missing parameters:', { owner, repo, prNumber, hasReview: !!reviewText });
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters: owner, repo, prNumber, and review text are required' 
      });
    }

    const githubAPI = new GitHubAPI(req.token);
    
    // Format the review comment
    const formattedReview = `🤖 **AI Code Review** (Generated by AI GitHub PR Reviewer)

${reviewText}

---
*This review was generated using local AI (${ollamaLLM.model}). Please use your judgment and verify suggestions.*`;

    const result = await githubAPI.postPullRequestComment(owner, repo, prNumber, formattedReview);
    
    if (result.success) {
      console.log('✅ Review posted successfully');
      res.json({ 
        success: true, 
        comment: {
          id: result.comment.id,
          url: result.comment.html_url,
          body: result.comment.body,
          created_at: result.comment.created_at
        }
      });
    } else {
      console.error('❌ Failed to post review:', result.error);
      res.status(500).json({ 
        success: false,
        error: result.error 
      });
    }
  } catch (error) {
    console.error('❌ Post review error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to post review comment: ' + error.message 
    });
  }
});

// Check Ollama status route is already defined above

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// Get current user info
app.get('/api/user', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        login: req.user.login,
        name: req.user.name,
        avatar_url: req.user.avatar_url,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Logout endpoint
app.post('/logout', (req, res) => {
  const sessionId = req.cookies.session_id;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie('session_id');
  res.json({ success: true, message: 'Logged out successfully' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`🚀 AI GitHub PR Reviewer server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 GitHub OAuth: http://localhost:${PORT}/auth/login`);
});

module.exports = app;