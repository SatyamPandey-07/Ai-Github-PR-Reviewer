#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const { spawn } = require('child_process');

class SetupWizard {
  constructor() {
    this.projectRoot = __dirname;
    this.config = {};
  }

  async run() {
    console.log('🧙‍♂️ AI GitHub PR Reviewer Setup Wizard');
    console.log('=====================================\n');

    try {
      await this.welcome();
      await this.checkPrerequisites();
      await this.configureGitHub();
      await this.configureOllama();
      await this.finalizeSetup();
      await this.showNextSteps();
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  async welcome() {
    console.log('Welcome to the AI GitHub PR Reviewer setup!');
    console.log('This wizard will help you configure the application.\n');

    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Continue with setup?',
      default: true
    }]);

    if (!proceed) {
      console.log('Setup cancelled.');
      process.exit(0);
    }
  }

  async checkPrerequisites() {
    console.log('\n🔍 Checking prerequisites...');

    // Check Node.js version
    const nodeVersion = process.version;
    console.log(`✅ Node.js version: ${nodeVersion}`);

    // Check npm
    try {
      await this.runCommand('npm', ['--version'], true);
      console.log('✅ npm is available');
    } catch (error) {
      throw new Error('npm is not available');
    }

    // Check git (optional)
    try {
      await this.runCommand('git', ['--version'], true);
      console.log('✅ Git is available');
    } catch (error) {
      console.log('⚠️  Git not found (optional)');
    }

    console.log('✅ Prerequisites check complete');
  }

  async configureGitHub() {
    console.log('\n🔐 GitHub OAuth Configuration');
    console.log('You need to create a GitHub OAuth App to use this tool.');
    console.log('Visit: https://github.com/settings/developers\n');

    const { hasOAuthApp } = await inquirer.prompt([{
      type: 'confirm',
      name: 'hasOAuthApp',
      message: 'Have you created a GitHub OAuth App?',
      default: false
    }]);

    if (!hasOAuthApp) {
      console.log('\n📝 Please create a GitHub OAuth App with these settings:');
      console.log('   - Application name: AI GitHub PR Reviewer');
      console.log('   - Homepage URL: http://localhost:5000');
      console.log('   - Authorization callback URL: http://localhost:5000/auth/callback\n');

      const { created } = await inquirer.prompt([{
        type: 'confirm',
        name: 'created',
        message: 'Have you created the OAuth App now?',
        default: false
      }]);

      if (!created) {
        throw new Error('GitHub OAuth App is required to continue');
      }
    }

    const githubConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'Enter your GitHub OAuth Client ID:',
        validate: input => input.length > 0 || 'Client ID is required'
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'Enter your GitHub OAuth Client Secret:',
        validate: input => input.length > 0 || 'Client Secret is required'
      },
      {
        type: 'input',
        name: 'redirectUri',
        message: 'Enter your redirect URI:',
        default: 'http://localhost:5000/auth/callback'
      }
    ]);

    this.config.github = githubConfig;
    console.log('✅ GitHub OAuth configured');
  }

  async configureOllama() {
    console.log('\n🤖 Ollama Configuration');

    const { hasOllama } = await inquirer.prompt([{
      type: 'confirm',
      name: 'hasOllama',
      message: 'Do you have Ollama installed?',
      default: false
    }]);

    if (!hasOllama) {
      console.log('\n📦 Please install Ollama:');
      console.log('   1. Visit: https://ollama.ai/');
      console.log('   2. Download and install Ollama');
      console.log('   3. Run: ollama serve');
      console.log('   4. Run: ollama pull gemma:2b (or your preferred model)\n');

      const { installed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'installed',
        message: 'Have you installed and started Ollama?',
        default: false
      }]);

      if (!installed) {
        console.log('⚠️  You can continue setup and install Ollama later.');
      }
    }

    const ollamaConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Ollama base URL:',
        default: 'http://localhost:11434'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Choose AI model:',
        choices: [
          { name: 'gemma:2b (Fast, lightweight)', value: 'gemma:2b' },
          { name: 'mistral (Balanced)', value: 'mistral' },
          { name: 'llama2 (Detailed)', value: 'llama2' },
          { name: 'codellama (Code-specialized)', value: 'codellama' },
          { name: 'deepseek-coder (Advanced)', value: 'deepseek-coder' }
        ],
        default: 'gemma:2b'
      }
    ]);

    this.config.ollama = ollamaConfig;
    console.log('✅ Ollama configuration set');
  }

  async finalizeSetup() {
    console.log('\n⚙️  Writing configuration...');

    // Create .env file
    const envContent = `# AI GitHub PR Reviewer Configuration
# Generated by setup wizard

# GitHub OAuth App Credentials
GITHUB_CLIENT_ID=${this.config.github.clientId}
GITHUB_CLIENT_SECRET=${this.config.github.clientSecret}
REDIRECT_URI=${this.config.github.redirectUri}

# Server Configuration
PORT=5000

# Ollama Configuration
OLLAMA_MODEL=${this.config.ollama.model}
OLLAMA_BASE_URL=${this.config.ollama.baseUrl}

# Debug Settings
DEBUG=false
LOG_LEVEL=info
`;

    const envPath = path.join(this.projectRoot, '.env');
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created');

    // Install dependencies if needed
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('📦 Installing dependencies...');
      await this.runCommand('npm', ['install']);
      console.log('✅ Dependencies installed');
    }

    console.log('✅ Setup complete!');
  }

  async showNextSteps() {
    console.log('\n🎉 Setup Complete!');
    console.log('==================\n');

    console.log('📋 Next steps:');
    console.log('1. Start Ollama: ollama serve');
    console.log(`2. Pull AI model: ollama pull ${this.config.ollama.model}`);
    console.log('3. Start the server: npm start');
    console.log('4. Use the CLI: npm run cli\n');

    console.log('🔗 Useful URLs:');
    console.log('   - Health check: http://localhost:5000/health');
    console.log('   - GitHub OAuth: http://localhost:5000/auth/login');
    console.log('   - API docs: See README.md\n');

    const { startNow } = await inquirer.prompt([{
      type: 'confirm',
      name: 'startNow',
      message: 'Start the server now?',
      default: true
    }]);

    if (startNow) {
      console.log('\n🚀 Starting server...');
      const { spawn } = require('child_process');
      
      const server = spawn('node', ['start.js'], {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      process.on('SIGINT', () => {
        server.kill('SIGINT');
        process.exit(0);
      });
    } else {
      console.log('\n👋 Run "npm start" when you\'re ready!');
    }
  }

  runCommand(command, args = [], silent = false) {
    return new Promise((resolve, reject) => {
      // Handle Windows npm command
      const isWindows = process.platform === 'win32';
      const cmd = command === 'npm' && isWindows ? 'npm.cmd' : command;
      
      const childProcess = spawn(cmd, args, {
        cwd: this.projectRoot,
        stdio: silent ? 'pipe' : 'inherit',
        shell: isWindows
      });

      childProcess.on('error', reject);
      childProcess.on('exit', (code) => {
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
  const wizard = new SetupWizard();
  wizard.run();
}

module.exports = SetupWizard;