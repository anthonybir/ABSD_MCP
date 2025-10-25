import { z } from 'zod';
import type { SessionManager } from './session.js';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const InteractSchema = z.object({
  pid: z.number().int().positive().describe('Process ID from start_process'),
  input: z.string().describe('Input to send to the process'),
  timeout: z.number().positive().default(8000).describe('Maximum wait time in milliseconds'),
  waitForPrompt: z.boolean().default(true).describe('Wait for REPL prompt or completion'),
});

export type InteractArgs = z.infer<typeof InteractSchema>;

/**
 * Detect if output contains a REPL prompt or completion indicator
 */
function detectPromptOrCompletion(output: string): { hasPrompt: boolean; hasError: boolean; isComplete: boolean } {
  const lastLines = output.slice(-200); // Check last 200 chars

  // Common REPL prompts
  const promptPatterns = [
    />>>\s*$/, // Python
    /\.\.\.\s*$/, // Python continuation
    />\s*$/, // Node.js, many REPLs
    /\$\s*$/, // Bash
    /#\s*$/, // Root shell
    /\*\s*$/, // Some REPLs
    /:\s*$/, // Some interactive prompts
  ];

  const hasPrompt = promptPatterns.some(pattern => pattern.test(lastLines));

  // Error indicators
  const errorPatterns = [
    /error:/i,
    /exception:/i,
    /traceback/i,
    /syntaxerror/i,
    /typeerror/i,
    /referenceerror/i,
    /cannot find/i,
    /undefined/i,
  ];

  const hasError = errorPatterns.some(pattern => pattern.test(output));

  // Completion indicators (process finished)
  const completePatterns = [
    /process exited/i,
    /command not found/i,
    /exit code/i,
  ];

  const isComplete = completePatterns.some(pattern => pattern.test(output));

  return { hasPrompt, hasError, isComplete };
}

export async function interactWithProcessTool(
  args: InteractArgs,
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

    if (session.state === 'terminated') {
      return {
        content: [{
          type: 'text',
          text: `Error: Process ${args.pid} has terminated`,
        }],
      };
    }

    // Clear buffer before sending input
    session.outputBuffer = [];

    // Send input (add \\r for proper REPL handling)
    session.ptyProcess.write(args.input + '\\r');
    session.state = 'running';

    // Wait for output with smart detection
    const startTime = Date.now();
    let output = '';

    if (args.waitForPrompt) {
      // Poll for output with early exit
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          output = session.outputBuffer.join('');

          const detection = detectPromptOrCompletion(output);

          // Early exit conditions
          if (detection.hasPrompt || detection.hasError || detection.isComplete || elapsed > args.timeout) {
            clearInterval(checkInterval);

            // Update session state
            if (detection.hasPrompt) {
              session.state = 'waiting';
            } else if (detection.isComplete) {
              session.state = 'terminated';
            }

            resolve();
          }
        }, 100); // Poll every 100ms
      });
    } else {
      // Just wait for timeout
      await new Promise(resolve => setTimeout(resolve, args.timeout));
      output = session.outputBuffer.join('');
    }

    const elapsed = Date.now() - startTime;
    const detection = detectPromptOrCompletion(output);

    // Determine status
    let status = 'completed';
    if (detection.hasPrompt) {
      status = 'ready (waiting for input)';
    } else if (detection.hasError) {
      status = 'error';
    } else if (elapsed >= args.timeout) {
      status = 'timeout (may still be running)';
    }

    logger.info({
      tool: 'interact_with_process',
      pid: args.pid,
      inputLength: args.input.length,
      outputLength: output.length,
      elapsed,
      status,
    }, 'Process interaction completed');

    return {
      content: [{
        type: 'text',
        text: `Process ${args.pid} | Status: ${status} | Time: ${elapsed}ms

${output || '[No output]'}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'interact_with_process');
    logger.error({ error: mcpError, args }, 'interact_with_process failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const interactWithProcessToolDefinition = {
  name: 'interact_with_process',
  description: 'Send input to a running process and wait for output. Automatically detects REPL prompts and completion. Perfect for Python/Node REPL interactions.',
  inputSchema: InteractSchema,
};
