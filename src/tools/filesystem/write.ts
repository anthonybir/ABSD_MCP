import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const WriteFileSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file'),
  content: z.string().describe('Content to write to the file'),
  mode: z.enum(['rewrite', 'append']).default('rewrite').describe('Write mode: rewrite (overwrite) or append'),
});

export type WriteFileArgs = z.infer<typeof WriteFileSchema>;

export async function writeFileTool(
  args: WriteFileArgs,
  validator: SecurityValidator,
  logger: Logger,
  config: { fileWriteLineLimit: number }
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

    // Count lines and warn if exceeds limit
    const lines = args.content.split('\n').length;
    if (lines > config.fileWriteLineLimit) {
      logger.warn({
        path: validPath,
        lines,
        limit: config.fileWriteLineLimit,
      }, 'Large write operation detected');
    }

    // Write file
    const flags = args.mode === 'append' ? 'a' : 'w';
    await writeFile(validPath, args.content, { flag: flags });

    logger.info({
      tool: 'write_file',
      path: validPath,
      lines,
      mode: args.mode,
    }, 'File written successfully');

    return {
      content: [{
        type: 'text',
        text: `Successfully ${args.mode === 'append' ? 'appended' : 'wrote'} ${lines} lines to ${basename(validPath)}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'write_file');
    logger.error({ error: mcpError, args }, 'write_file failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const writeFileToolDefinition = {
  name: 'write_file',
  description: 'Create or overwrite a file with content. Supports append mode. Large writes (>50 lines) should be chunked.',
  inputSchema: WriteFileSchema,
};
