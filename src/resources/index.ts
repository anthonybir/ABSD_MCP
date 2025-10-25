import type { Config } from '../types/config.js';
import type { SessionManager } from '../tools/terminal/session.js';

/**
 * MCP Resources - Expose server state and configuration
 */

export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export function getResourceDefinitions(): ResourceDefinition[] {
  return [
    {
      uri: 'config://absd-mcp/server',
      name: 'Server Configuration',
      description: 'Current MCP server configuration including allowed directories and security settings',
      mimeType: 'application/json',
    },
    {
      uri: 'state://absd-mcp/sessions',
      name: 'Active Sessions',
      description: 'List of currently active terminal sessions',
      mimeType: 'application/json',
    },
  ];
}

export function getResourceContent(
  uri: string,
  config: Config,
  sessionManager: SessionManager
): { mimeType: string; text: string } | null {
  switch (uri) {
    case 'config://absd-mcp/server': {
      const configData = {
        allowedDirectories: config.allowedDirectories,
        blockedCommands: config.blockedCommands,
        fileReadLineLimit: config.fileReadLineLimit,
        fileWriteLineLimit: config.fileWriteLineLimit,
        sessionTimeout: config.sessionTimeout,
        logLevel: config.logLevel,
      };

      return {
        mimeType: 'application/json',
        text: JSON.stringify(configData, null, 2),
      };
    }

    case 'state://absd-mcp/sessions': {
      const sessions = sessionManager.listAll();
      const sessionData = {
        count: sessions.length,
        sessions: sessions.map(s => ({
          pid: s.pid,
          shell: s.shell,
          cwd: s.cwd,
          state: s.state,
          uptime: s.uptime,
          lastActivity: s.lastActivity,
          outputLines: s.outputLines,
        })),
      };

      return {
        mimeType: 'application/json',
        text: JSON.stringify(sessionData, null, 2),
      };
    }

    default:
      return null;
  }
}
