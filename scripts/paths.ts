import os from 'os';
import path from 'path';

/**
 * Get the Claude Desktop config path for the current platform.
 * Returns null if platform is unsupported or required environment variables are missing.
 */
export function getClaudeConfigPath(): string | null {
  const platform = process.platform;

  if (platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );
  }

  if (platform === 'win32') {
    // Validate APPDATA exists on Windows
    if (!process.env.APPDATA) {
      return null;
    }
    return path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');
  }

  // Linux and other platforms not supported
  return null;
}

/**
 * Get the default ABSD MCP config directory path.
 */
export function getDefaultConfigDir(): string {
  return path.join(os.homedir(), 'ABSD_MCP');
}

/**
 * Get the default ABSD MCP config file path.
 */
export function getDefaultConfigPath(): string {
  return path.join(getDefaultConfigDir(), 'config.json');
}
