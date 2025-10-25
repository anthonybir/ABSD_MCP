import { z } from 'zod';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

// ============================================================================
// LIST_PROCESSES
// ============================================================================

const ListProcessesSchema = z.object({});

interface ProcessInfo {
  pid: number;
  name: string;
  cpu?: string;
  memory?: string;
}

/**
 * Parse process list output based on platform
 * Windows PowerShell: Get-Process returns CSV-like format
 * macOS/Linux: ps returns space-separated format
 */
function parseProcessList(output: string, osPlatform: string): ProcessInfo[] {
  const lines = output.trim().split('\n');
  const processes: ProcessInfo[] = [];

  if (osPlatform === 'win32') {
    // Windows PowerShell output format: PID,ProcessName,CPU,WorkingSet
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length >= 2) {
        const pid = parseInt(parts[0], 10);
        if (!isNaN(pid)) {
          processes.push({
            pid,
            name: parts[1],
            cpu: parts[2] || '0',
            memory: parts[3] ? (parseInt(parts[3]) / 1024 / 1024).toFixed(1) + 'M' : '0M',
          });
        }
      }
    }
  } else {
    // macOS/Linux ps output format
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        const pid = parseInt(parts[0], 10);
        if (!isNaN(pid)) {
          processes.push({
            pid,
            cpu: parts[1],
            memory: parts[2],
            name: parts.slice(3).join(' '),
          });
        }
      }
    }
  }

  return processes;
}

export async function listProcessesTool(
  logger: Logger
): Promise<ToolResult> {
  try {
    const osPlatform = platform();
    let command: string;
    let args: string[];

    if (osPlatform === 'win32') {
      // Windows PowerShell with CSV output
      command = 'powershell.exe';
      args = [
        '-NoProfile',
        '-Command',
        'Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet | ConvertTo-Csv -NoTypeInformation',
      ];
    } else {
      // macOS/Linux
      command = 'ps';
      args = ['aux'];
    }

    const proc = spawn(command, args);
    let output = '';
    let errorOutput = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf-8');
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf-8');
    });

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('exit', (code) => resolve(code ?? 1));
      proc.on('error', () => resolve(1));
    });

    if (exitCode !== 0) {
      throw new Error(`Failed to list processes: ${errorOutput}`);
    }

    const processes = parseProcessList(output, osPlatform);

    logger.info({
      tool: 'list_processes',
      count: processes.length,
      platform: osPlatform,
    }, 'Processes listed');

    // Format output
    const processList = processes
      .slice(0, 100) // Limit to first 100 for readability
      .map(p => `[${p.pid}] ${p.name} | CPU: ${p.cpu || 'N/A'}% | Memory: ${p.memory || 'N/A'}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `Running Processes (showing first 100 of ${processes.length}):

${processList}

Platform: ${osPlatform}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'list_processes');
    logger.error({ error: mcpError }, 'list_processes failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const listProcessesToolDefinition = {
  name: 'list_processes',
  description: 'List all running system processes with PID, name, CPU usage, and memory usage.',
  inputSchema: ListProcessesSchema,
};

// ============================================================================
// KILL_PROCESS
// ============================================================================

const KillProcessSchema = z.object({
  pid: z.number().int().positive().describe('Process ID to kill'),
  confirmToken: z.string().optional().describe('Confirmation token (PID as string) to prevent accidental kills'),
});

export type KillProcessArgs = z.infer<typeof KillProcessSchema>;

export async function killProcessTool(
  args: KillProcessArgs,
  logger: Logger
): Promise<ToolResult> {
  try {
    // Validate confirmation token
    if (!args.confirmToken || args.confirmToken !== String(args.pid)) {
      return {
        content: [{
          type: 'text',
          text: `Error: Confirmation token required. To kill process ${args.pid}, set confirmToken to "${args.pid}"`,
        }],
      };
    }

    const osPlatform = platform();
    let command: string;
    let cmdArgs: string[];

    if (osPlatform === 'win32') {
      // Windows
      command = 'taskkill';
      cmdArgs = ['/F', '/PID', String(args.pid)];
    } else {
      // macOS/Linux
      command = 'kill';
      cmdArgs = ['-9', String(args.pid)];
    }

    const proc = spawn(command, cmdArgs);
    let errorOutput = '';

    proc.stderr?.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf-8');
    });

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('exit', (code) => resolve(code ?? 1));
      proc.on('error', () => resolve(1));
    });

    if (exitCode !== 0) {
      throw new Error(`Failed to kill process: ${errorOutput}`);
    }

    logger.info({
      tool: 'kill_process',
      pid: args.pid,
      platform: osPlatform,
    }, 'Process killed');

    return {
      content: [{
        type: 'text',
        text: `Process ${args.pid} killed successfully`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'kill_process');
    logger.error({ error: mcpError, args }, 'kill_process failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const killProcessToolDefinition = {
  name: 'kill_process',
  description: 'Kill a system process by PID. Requires confirmation token (PID as string) to prevent accidental kills. Use list_processes to find PIDs.',
  inputSchema: KillProcessSchema,
};
