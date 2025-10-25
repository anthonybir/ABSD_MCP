import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClaudeConfigPath, getDefaultConfigDir, getDefaultConfigPath } from './paths.js';
import { askYesNo } from './prompts.js';

/**
 * Manual setup script for registering ABSD MCP in Claude Desktop
 * Run via: npm run -g @anthonybir/devops-mcp setup
 */
async function main() {
  try {
    console.log('\n🚀 ABSD DevOps MCP Setup\n');

    // Check platform support
    const platform = process.platform;
    if (platform === 'linux') {
      console.log('❌ Linux not supported for Claude Desktop configuration');
      console.log('   Please configure manually in your MCP settings\n');
      process.exit(1);
    }

    // Check if Claude Desktop config exists
    const claudePath = getClaudeConfigPath();
    if (!claudePath) {
      console.log('❌ Claude Desktop config path not found');
      console.log('   Expected location:', platform === 'darwin'
        ? '~/Library/Application Support/Claude/claude_desktop_config.json'
        : '%APPDATA%\\Claude\\claude_desktop_config.json');
      console.log('\n   Make sure Claude Desktop is installed\n');
      process.exit(1);
    }

    if (!fs.existsSync(claudePath)) {
      console.log('❌ Claude Desktop config not found at:', claudePath);
      console.log('   Make sure Claude Desktop is installed and has been run at least once\n');
      process.exit(1);
    }

    // Interactive prompt
    const shouldRegister = await askYesNo('📝 Register absd-devops MCP in Claude Desktop?');

    if (!shouldRegister) {
      console.log('\n❌ Setup cancelled. See README for manual configuration.\n');
      process.exit(0);
    }

    // Load existing Claude config (no validation to avoid Zod version conflicts)
    const configText = fs.readFileSync(claudePath, 'utf-8');
    const config = JSON.parse(configText);

    // Check if already registered
    if (config.mcpServers?.['absd-devops']) {
      console.log('✅ absd-devops already registered in Claude Desktop');
      process.exit(0);
    }

    // Create timestamped backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${claudePath}.backup-${timestamp}`;
    fs.copyFileSync(claudePath, backupPath);

    // Prepare config paths
    const configDir = getDefaultConfigDir();
    const configPath = getDefaultConfigPath();

    // Update mcpServers with new entry (using bin entry, not npx @latest)
    config.mcpServers = config.mcpServers || {};
    config.mcpServers['absd-devops'] = {
      command: 'absd-mcp',
      args: [],
      env: {
        ABSD_MCP_CONFIG: configPath,
      },
    };

    // Atomic write: temp file → remove original → rename (Windows-safe)
    const tempPath = `${claudePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));
    if (fs.existsSync(claudePath)) {
      fs.rmSync(claudePath);
    }
    fs.renameSync(tempPath, claudePath);

    console.log('✅ Added absd-devops to Claude Desktop config');
    console.log(`📁 Backup saved: ${backupPath}`);

    // Ensure default ABSD config exists
    await ensureDefaultConfig(configDir, configPath);

    console.log('\n✨ Setup complete!');
    console.log('🔄 Restart Claude Desktop to activate the MCP server\n');
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Setup failed:', message);
    console.error('   See README for manual configuration steps\n');
    process.exit(1);
  }
}

/**
 * Ensure default ABSD MCP config exists
 * Reads defaults from config.example.json (single source of truth)
 */
async function ensureDefaultConfig(configDir: string, configPath: string) {
  // Create directory if needed
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // If config already exists, skip
  if (fs.existsSync(configPath)) {
    console.log(`ℹ️  Using existing config: ${configPath}`);
    return;
  }

  // Load defaults from config.example.json
  const examplePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config.example.json');
  let defaultConfig: any;

  if (fs.existsSync(examplePath)) {
    // Read from config.example.json
    const exampleText = fs.readFileSync(examplePath, 'utf-8');
    defaultConfig = JSON.parse(exampleText);
    // Override allowedDirectories to user's home
    defaultConfig.allowedDirectories = [os.homedir()];
  } else {
    // Fallback if example not found
    defaultConfig = {
      allowedDirectories: [os.homedir()],
      blockedCommands: [
        'rm -rf /',
        'dd if=/dev/zero',
        'mkfs',
        'shutdown',
        'reboot',
        'init 0',
      ],
      fileReadLineLimit: 2000,
      fileWriteLineLimit: 75,
      sessionTimeout: 1800000,
      logLevel: 'info',
    };
  }

  // Write default config
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`✅ Created default config: ${configPath}`);
  console.log(`⚠️  WARNING: Allows full access to home directory: ${os.homedir()}`);
  console.log(`   Review and restrict allowedDirectories as needed.`);
}

// Execute main
main();
