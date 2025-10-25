import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError, createNotFoundError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const ReadFileSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file'),
  offset: z.number().int().default(0).describe('Line offset to start reading from (negative for tail)'),
  length: z.number().int().positive().optional().describe('Maximum number of lines to read'),
});

export type ReadFileArgs = z.infer<typeof ReadFileSchema>;

export async function readFileTool(
  args: ReadFileArgs,
  validator: SecurityValidator,
  logger: Logger,
  config: { fileReadLineLimit: number }
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

    // Read file
    const content = await readFile(validPath, 'utf-8').catch((error) => {
      if (error.code === 'ENOENT') {
        throw createNotFoundError(args.path);
      }
      throw error;
    });

    const lines = content.split('\n');
    const totalLines = lines.length;

    // Apply line limit
    const maxLines = args.length ?? config.fileReadLineLimit;

    // Handle offset (negative = tail)
    const startIdx = args.offset < 0
      ? Math.max(0, totalLines + args.offset)
      : Math.min(args.offset, totalLines);

    const endIdx = Math.min(startIdx + maxLines, totalLines);
    const chunk = lines.slice(startIdx, endIdx);

    logger.info({
      tool: 'read_file',
      path: validPath,
      totalLines,
      returnedLines: chunk.length,
      offset: startIdx,
    }, 'File read successfully');

    return {
      content: [{
        type: 'text',
        text: chunk.join('\n'),
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'read_file');
    logger.error({ error: mcpError, args }, 'read_file failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const readFileToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file with optional chunking and offset support. Use negative offset for tail behavior.',
  inputSchema: ReadFileSchema,
};
