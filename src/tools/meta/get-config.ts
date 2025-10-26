import { z } from 'zod';
import type { Config } from '../../types/config.js';
import type { ToolResult } from '../../types/config.js';
import { SERVER_VERSION } from '../../version.js';

export const getConfigToolDefinition = {
  name: 'get_config',
  description: 'Get the complete server configuration as JSON (read-only). Shows allowed directories, blocked commands, limits, and security status.',
  inputSchema: z.object({}),
};

export type GetConfigArgs = z.infer<typeof getConfigToolDefinition.inputSchema>;

/**
 * Get current server configuration (read-only)
 * Includes security metadata to help understand access level
 */
export async function getConfigTool(config: Config): Promise<ToolResult> {
  const securityStatus = config.allowedDirectories.length === 0
    ? '🔴 UNRESTRICTED ACCESS - Full filesystem available (DANGEROUS)'
    : '🟢 RESTRICTED - Limited to allowed directories';

  const configData = {
    allowedDirectories: config.allowedDirectories,
    blockedCommands: config.blockedCommands,
    fileReadLineLimit: config.fileReadLineLimit,
    fileWriteLineLimit: config.fileWriteLineLimit,
    sessionTimeout: config.sessionTimeout,
    logLevel: config.logLevel,
    urlDenylist: config.urlDenylist,
    urlTimeout: config.urlTimeout,
    version: SERVER_VERSION,
    platform: process.platform,
    nodeVersion: process.version,
    // Security metadata
    security: {
      status: securityStatus,
      hasUnrestrictedAccess: config.allowedDirectories.length === 0,
      totalAllowedPaths: config.allowedDirectories.length,
      totalBlockedCommands: config.blockedCommands.length,
      totalDeniedHosts: config.urlDenylist.length,
      warning:
        config.allowedDirectories.length === 0
          ? '⚠️ WARNING: Unrestricted filesystem access enabled. Any tool can read/write/delete ANY file on the system.'
          : null,
    },
  };

  return {
    content: [
      {
        type: 'text',
        text:
          '=== ABSD MCP Server Configuration ===\n\n' +
          `Security Status: ${securityStatus}\n\n` +
          JSON.stringify(configData, null, 2) +
          '\n\n⚠️  Configuration is read-only. To modify, update config file and restart server.',
      },
    ],
  };
}
