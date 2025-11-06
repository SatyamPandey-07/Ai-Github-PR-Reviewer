#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class ProjectStarter {
  constructor() {
    this.projectRoot = __dirname;
  }

  async start() {
    console.log('🚀 Starting AI GitHub PR Reviewer...\n');
    
    try {
      // Check environment
      await this.checkEnvironment();
      
      // Check dependencies
      await this.checkDependencies();
      
      // Start server
      await this.startServer();
      
    } catch (error) {
      console.error('❌ Startup Error:', error.message);
      process.exit(1);
    }
  }

  async checkEnvironment() {
    console.log('🔍 Checking environment...');
    
    // Check if .env exists
    const envPath = path.join(this.projectRoot, '.env');
    if (!fs.existsSync(envPath)) {
      console.log('⚠️  .env file not found, copying from .env.example');
      const examplePath = path.join(this.projectRoot, '.env.example');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, envPath);
        console.log('✅ Created .env file from template');
        console.log('📝 Please edit .env with your GitHub OAuth credentials');
      } else {
        throw new Error('.env.example file not found');
      }
    }
    
    // Load environment variables
    require('dotenv').config({ path: envPath });
    
    // Check required environment variables
    const required = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
    const missing = required.filter(key => !process.env[key] || process.env[key].includes('your_'));
    
    if (missing.length > 0) {
      console.log('⚠️  Missing or incomplete environment variables:');
      missing.forEach(key => console.log(`   - ${key}`));
      console.log('📝 Please edit .env file with your actual values');
      console.log('🔗 Create GitHub OAuth app: https://github.com/settings/developers');
    } else {
      console.log('✅ Environment variables configured');
    }
  }

  async checkDependencies() {
    console.log('🔍 Checking dependencies...');
    
    const packagePath = path.join(this.projectRoot, 'package.json');
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
    
    if (!fs.existsSync(packagePath)) {
      throw new Error('package.json not found');
    }
    
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('⚠️  node_modules not found, installing dependencies...');
      await this.runCommand('npm', ['install']);
      console.log('✅ Dependencies installed');
    } else {
      console.log('✅ Dependencies found');
    }
  }

  async startServer() {
    console.log('🚀 Starting server...');
    console.log('📍 Working directory:', this.projectRoot);
    console.log('🌐 Server will be available at: http://localhost:5000');
    console.log('📊 Health check: http://localhost:5000/health');
    console.log('🔐 GitHub OAuth: http://localhost:5000/auth/login');
    console.log('💻 CLI mode: npm run cli (in another terminal)');
    console.log('\\n' + '='.repeat(50) + '\\n');
    
    // Start the server
    const serverProcess = spawn('node', ['server.js'], {
      cwd: this.projectRoot,
      stdio: 'inherit',
      env: { ...process.env }
    });

    serverProcess.on('error', (error) => {
      console.error('❌ Failed to start server:', error.message);
      process.exit(1);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Server exited with code ${code}`);
        process.exit(code);
      }
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\\n🛑 Shutting down server...');
      serverProcess.kill('SIGINT');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\\n🛑 Shutting down server...');
      serverProcess.kill('SIGTERM');
      process.exit(0);
    });
  }

  runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      process.on('error', reject);
      process.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });
    });
  }
}

// Run if called directly
if (require.main === module) {
  const starter = new ProjectStarter();
  starter.start();
}

module.exports = ProjectStarter;