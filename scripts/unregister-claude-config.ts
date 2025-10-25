import fs from 'fs';
import { fileURLToPath } from 'url';
import { getClaudeConfigPath, getDefaultConfigPath } from './paths.js';

/**
 * Manual unregistration script for removing ABSD MCP from Claude Desktop
 * Run via: npm run -g @anthonybir/devops-mcp unregister
 */
async function main() {
  try {
    console.log('\n🗑️  ABSD DevOps MCP Unregister\n');

    // Check platform support
    const platform = process.platform;
    if (platform === 'linux') {
      console.log('ℹ️  Linux - please remove manually from your MCP settings\n');
      process.exit(0);
    }

    // Check if Claude Desktop config exists
    const claudePath = getClaudeConfigPath();
    if (!claudePath || !fs.existsSync(claudePath)) {
      console.log('ℹ️  Claude Desktop config not found - nothing to unregister\n');
      process.exit(0);
    }

    // Load existing Claude config (no validation to avoid Zod version conflicts)
    const configText = fs.readFileSync(claudePath, 'utf-8');
    const config = JSON.parse(configText);

    // Check if entry exists
    if (!config.mcpServers?.['absd-devops']) {
      console.log('ℹ️  absd-devops not registered in Claude Desktop - nothing to remove\n');
      process.exit(0);
    }

    // Create timestamped backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${claudePath}.backup-${timestamp}`;
    fs.copyFileSync(claudePath, backupPath);

    // Remove entry
    delete config.mcpServers['absd-devops'];

    // Atomic write: temp file → remove original → rename (Windows-safe)
    const tempPath = `${claudePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));
    if (fs.existsSync(claudePath)) {
      fs.rmSync(claudePath);
    }
    fs.renameSync(tempPath, claudePath);

    console.log('✅ Removed absd-devops from Claude Desktop config');
    console.log(`📁 Backup saved: ${backupPath}`);

    const configPath = getDefaultConfigPath();
    console.log(`\nℹ️  Config file preserved: ${configPath}`);
    console.log(`   Delete manually if no longer needed\n`);
    console.log('🔄 Restart Claude Desktop to complete removal\n');

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Unregister failed:', message);
    console.error('   You may need to remove the entry manually\n');
    process.exit(1);
  }
}

// Execute main
main();
