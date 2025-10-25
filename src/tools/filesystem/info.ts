import { stat, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError, createNotFoundError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const GetFileInfoSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file or directory'),
});

export type GetFileInfoArgs = z.infer<typeof GetFileInfoSchema>;

export async function getFileInfoTool(
  args: GetFileInfoArgs,
  validator: SecurityValidator,
  logger: Logger
): Promise<ToolResult> {
  try {
    // Validate path
    const validation = validator.validatePath(args.path);
    if (!validation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${validation.error}`,
        }],
      };
    }

    const validPath = validation.resolvedPath!;

    // Get file stats
    const stats = await stat(validPath).catch((error) => {
      if (error.code === 'ENOENT') {
        throw createNotFoundError(args.path);
      }
      throw error;
    });

    // For text files, count lines
    let lineInfo = '';
    if (stats.isFile()) {
      try {
        const content = await readFile(validPath, 'utf-8');
        const lines = content.split('\n');
        const lineCount = lines.length;
        const lastLine = lineCount - 1;
        lineInfo = `\nLines: ${lineCount}\nLast Line (0-indexed): ${lastLine}\nAppend Position: ${lineCount}`;
      } catch {
        // Binary file or read error, skip line counting
        lineInfo = '\n[Binary file or unreadable as text]';
      }
    }

    const info = `File Information: ${args.path}
Type: ${stats.isDirectory() ? 'Directory' : stats.isFile() ? 'File' : stats.isSymbolicLink() ? 'Symlink' : 'Other'}
Size: ${stats.size} bytes (${(stats.size / 1024).toFixed(2)} KB)
Created: ${stats.birthtime.toISOString()}
Modified: ${stats.mtime.toISOString()}
Accessed: ${stats.atime.toISOString()}
Permissions: ${stats.mode.toString(8).slice(-3)}${lineInfo}`;

    logger.info({
      tool: 'get_file_info',
      path: validPath,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
    }, 'File info retrieved successfully');

    return {
      content: [{
        type: 'text',
        text: info,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'get_file_info');
    logger.error({ error: mcpError, args }, 'get_file_info failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const getFileInfoToolDefinition = {
  name: 'get_file_info',
  description: 'Get detailed metadata about a file or directory including size, permissions, timestamps, and line count for text files.',
  inputSchema: GetFileInfoSchema,
};
