import { rename } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const MoveFileSchema = z.object({
  source: z.string().describe('Absolute or relative path to the source file/directory'),
  destination: z.string().describe('Absolute or relative path to the destination file/directory'),
});

export type MoveFileArgs = z.infer<typeof MoveFileSchema>;

export async function moveFileTool(
  args: MoveFileArgs,
  validator: SecurityValidator,
  logger: Logger
): Promise<ToolResult> {
  try {
    // Validate source path
    const sourceValidation = validator.validatePath(args.source);
    if (!sourceValidation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Error (source): ${sourceValidation.error}`,
        }],
      };
    }

    const validSource = sourceValidation.resolvedPath!;

    // Validate destination path
    const destValidation = validator.validatePath(args.destination);
    if (!destValidation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Error (destination): ${destValidation.error}`,
        }],
      };
    }

    const validDestination = destValidation.resolvedPath!;

    // Perform move/rename operation
    await rename(validSource, validDestination);

    logger.info({
      tool: 'move_file',
      source: validSource,
      destination: validDestination,
    }, 'File/directory moved successfully');

    return {
      content: [{
        type: 'text',
        text: `Successfully moved ${basename(validSource)} to ${validDestination}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'move_file');
    logger.error({ error: mcpError, args }, 'move_file failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const moveFileToolDefinition = {
  name: 'move_file',
  description: 'Move or rename a file or directory. Both source and destination paths must be within allowed directories.',
  inputSchema: MoveFileSchema,
};
