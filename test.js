const axios = require('axios');

class HealthChecker {
  constructor() {
    this.baseURL = 'http://localhost:5000';
  }

  async runTests() {
    console.log('🧪 Running AI GitHub PR Reviewer Tests\n');
    console.log('='.repeat(40));

    const tests = [
      { name: 'Server Health Check', test: () => this.testServerHealth() },
      { name: 'Ollama Status Check', test: () => this.testOllamaStatus() },
      { name: 'GitHub OAuth URL', test: () => this.testGitHubAuth() }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        console.log(`\n🔍 Testing: ${test.name}`);
        await test.test();
        console.log(`✅ PASS: ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error.message || error.toString()}`);
        if (error.response && error.response.data) {
          console.log(`   Response: ${JSON.stringify(error.response.data)}`);
        }
        failed++;
      }
    }

    console.log('\n' + '='.repeat(40));
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log('🎉 All tests passed! Your setup is ready.');
    } else {
      console.log('⚠️  Some tests failed. Check the errors above.');
    }
  }

  async testServerHealth() {
    try {
      const response = await axios.get(`${this.baseURL}/health`, { timeout: 5000 });
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      if (!response.data.status || response.data.status !== 'OK') {
        throw new Error('Health check did not return OK status');
      }
      
      console.log('   ✓ Server is running and responding');
      console.log(`   ✓ Server message: ${response.data.message}`);
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Server is not running on port 5000');
      }
      throw error;
    }
  }

  async testOllamaStatus() {
    try {
      const response = await axios.get(`${this.baseURL}/api/ollama/status`, { timeout: 10000 });
      
      if (response.data.running) {
        console.log('   ✓ Ollama is running');
        console.log(`   ✓ Model available: ${response.data.modelAvailable}`);
        
        if (response.data.availableModels && response.data.availableModels.length > 0) {
          console.log(`   ✓ Available models: ${response.data.availableModels.join(', ')}`);
        }
      } else {
        throw new Error('Ollama is not running');
      }
    } catch (error) {
      if (error.response && error.response.status === 500) {
        throw new Error('Ollama is not running - start with: ollama serve');
      }
      throw error;
    }
  }

  async testGitHubAuth() {
    // Test that the auth endpoint redirects properly
    try {
      const response = await axios.get(`${this.baseURL}/auth/login`, { 
        maxRedirects: 0,
        validateStatus: (status) => status === 302
      });
      
      if (response.status === 302) {
        const location = response.headers.location;
        if (location && location.includes('github.com/login/oauth/authorize')) {
          console.log('   ✓ GitHub OAuth redirect is working');
          console.log(`   ✓ Redirect URL: ${location.substring(0, 50)}...`);
        } else {
          throw new Error('Invalid GitHub OAuth redirect URL');
        }
      } else {
        throw new Error(`Expected redirect (302), got status ${response.status}`);
      }
    } catch (error) {
      if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
        throw new Error('GitHub OAuth configuration error - check your .env file');
      }
      throw error;
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const checker = new HealthChecker();
  checker.runTests().catch(error => {
    console.error('\n❌ Test runner error:', error.message);
    process.exit(1);
  });
}

module.exports = HealthChecker;