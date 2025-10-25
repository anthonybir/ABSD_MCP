import { z } from 'zod';
import type { SessionManager } from './session.js';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

// ============================================================================
// READ_PROCESS_OUTPUT
// ============================================================================

const ReadProcessOutputSchema = z.object({
  pid: z.number().int().positive().describe('Process ID from start_process'),
  timeout: z.number().positive().default(2000).describe('Maximum wait time in milliseconds'),
});

export type ReadProcessOutputArgs = z.infer<typeof ReadProcessOutputSchema>;

export async function readProcessOutputTool(
  args: ReadProcessOutputArgs,
  sessionManager: SessionManager,
  logger: Logger
): Promise<ToolResult> {
  try {
    const session = sessionManager.get(args.pid);
    if (!session) {
      return {
        content: [{
          type: 'text',
          text: `Error: Process not found: PID ${args.pid}`,
        }],
      };
    }

    // Wait for timeout to collect output
    await new Promise(resolve => setTimeout(resolve, args.timeout));

    const output = session.outputBuffer.join('');
    session.outputBuffer = []; // Clear buffer after reading

    logger.info({
      tool: 'read_process_output',
      pid: args.pid,
      outputLength: output.length,
    }, 'Process output read');

    return {
      content: [{
        type: 'text',
        text: `Process ${args.pid} | State: ${session.state}

${output || '[No new output]'}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'read_process_output');
    logger.error({ error: mcpError, args }, 'read_process_output failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const readProcessOutputToolDefinition = {
  name: 'read_process_output',
  description: 'Read buffered output from a running process without sending input. Useful for checking background process status.',
  inputSchema: ReadProcessOutputSchema,
};

// ============================================================================
// LIST_SESSIONS
// ============================================================================

const ListSessionsSchema = z.object({});

export async function listSessionsTool(
  sessionManager: SessionManager,
  logger: Logger
): Promise<ToolResult> {
  try {
    const sessions = sessionManager.listAll();

    if (sessions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No active sessions',
        }],
      };
    }

    const sessionList = sessions.map(s => {
      const uptimeMin = Math.floor(s.uptime / 60000);
      const idleMin = Math.floor(s.lastActivity / 60000);

      return `[PID ${s.pid}] ${s.shell}
  State: ${s.state}
  CWD: ${s.cwd}
  Uptime: ${uptimeMin}m | Idle: ${idleMin}m | Output lines: ${s.outputLines}`;
    }).join('\\n\\n');

    logger.info({
      tool: 'list_sessions',
      count: sessions.length,
    }, 'Sessions listed');

    return {
      content: [{
        type: 'text',
        text: `Active Sessions (${sessions.length}):

${sessionList}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'list_sessions');
    logger.error({ error: mcpError }, 'list_sessions failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const listSessionsToolDefinition = {
  name: 'list_sessions',
  description: 'List all active terminal sessions with their status, uptime, and idle time.',
  inputSchema: ListSessionsSchema,
};

// ============================================================================
// TERMINATE_PROCESS
// ============================================================================

const TerminateProcessSchema = z.object({
  pid: z.number().int().positive().describe('Process ID to terminate'),
});

export type TerminateProcessArgs = z.infer<typeof TerminateProcessSchema>;

export async function terminateProcessTool(
  args: TerminateProcessArgs,
  sessionManager: SessionManager,
  logger: Logger
): Promise<ToolResult> {
  try {
    const success = sessionManager.terminate(args.pid);

    if (!success) {
      return {
        content: [{
          type: 'text',
          text: `Error: Process not found: PID ${args.pid}`,
        }],
      };
    }

    logger.info({
      tool: 'terminate_process',
      pid: args.pid,
    }, 'Process terminated');

    return {
      content: [{
        type: 'text',
        text: `Process ${args.pid} terminated successfully`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'terminate_process');
    logger.error({ error: mcpError, args }, 'terminate_process failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const terminateProcessToolDefinition = {
  name: 'terminate_process',
  description: 'Terminate a running terminal session by PID. Use list_sessions to see active PIDs.',
  inputSchema: TerminateProcessSchema,
};
