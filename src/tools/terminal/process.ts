import { z } from 'zod';
import type { SessionManager } from './session.js';
import type { SecurityValidator } from '../../security/validator.js';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const StartProcessSchema = z.object({
  command: z.string().describe('Command to execute (e.g., "python3 -i", "node", "bash")'),
  cwd: z.string().optional().describe('Working directory for the process'),
  shell: z.string().optional().describe('Shell to use (defaults to system shell)'),
  timeout: z.number().positive().default(5000).describe('Initial timeout in milliseconds'),
});

export type StartProcessArgs = z.infer<typeof StartProcessSchema>;

export async function startProcessTool(
  args: StartProcessArgs,
  sessionManager: SessionManager,
  validator: SecurityValidator,
  logger: Logger
): Promise<ToolResult> {
  try {
    // Validate command
    const cmdValidation = validator.validateCommand(args.command);
    if (!cmdValidation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${cmdValidation.error}`,
        }],
      };
    }

    // Validate working directory if provided
    const cwd = args.cwd || process.env.HOME || process.cwd();
    const pathValidation = validator.validatePath(cwd);
    if (!pathValidation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Error: Invalid working directory: ${pathValidation.error}`,
        }],
      };
    }

    // Parse command and args
    const [cmd, ...cmdArgs] = args.command.split(' ');
    const shell = args.shell || cmd;

    // Create session
    const session = sessionManager.create(shell, cmdArgs, pathValidation.resolvedPath!);

    // Wait for initial output or timeout
    await new Promise(resolve => setTimeout(resolve, Math.min(args.timeout, 2000)));

    const output = session.outputBuffer.join('');
    session.outputBuffer = []; // Clear buffer after reading

    logger.info({
      tool: 'start_process',
      pid: session.pid,
      command: args.command,
      cwd: pathValidation.resolvedPath,
    }, 'Process started successfully');

    return {
      content: [
        {
          type: 'text',
          text: `Process started successfully
PID: ${session.pid}
Command: ${args.command}
CWD: ${pathValidation.resolvedPath}
State: ${session.state}

Initial output:
${output || '[No output yet]'}`,
        },
        {
          type: 'json',
          json: {
            pid: session.pid,
            command: args.command,
            cwd: pathValidation.resolvedPath,
            state: session.state,
          },
        },
      ],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'start_process');
    logger.error({ error: mcpError, args }, 'start_process failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const startProcessToolDefinition = {
  name: 'start_process',
  description: 'Start an interactive terminal process (REPL, shell, or command). Returns PID for future interactions. Supports Python, Node.js, bash, and other interactive programs.',
  inputSchema: StartProcessSchema,
};
