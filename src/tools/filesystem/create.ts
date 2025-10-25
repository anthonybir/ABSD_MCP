import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const CreateDirectorySchema = z.object({
  path: z.string().describe('Absolute or relative path to the directory to create'),
  recursive: z.boolean().default(true).describe('Create parent directories if they don\'t exist'),
});

export type CreateDirectoryArgs = z.infer<typeof CreateDirectorySchema>;

export async function createDirectoryTool(
  args: CreateDirectoryArgs,
  validator: SecurityValidator,
  logger: Logger
): Promise<ToolResult> {
  try {
    // Validate parent path first (for recursive creation)
    const parentPath = args.recursive ? validator.findExistingParent(args.path) : dirname(args.path);

    if (parentPath) {
      const parentValidation = validator.validatePath(parentPath);
      if (!parentValidation.valid) {
        return {
          content: [{
            type: 'text',
            text: `Error: Parent directory outside allowed directories: ${parentPath}`,
          }],
        };
      }
    }

    // Validate the target path
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

    // Check if directory already exists
    if (validator.isDirectory(validPath)) {
      logger.info({ tool: 'create_directory', path: validPath }, 'Directory already exists');
      return {
        content: [{
          type: 'text',
          text: `Directory already exists: ${args.path}`,
        }],
      };
    }

    // Create directory
    await mkdir(validPath, { recursive: args.recursive });

    logger.info({
      tool: 'create_directory',
      path: validPath,
      recursive: args.recursive,
    }, 'Directory created successfully');

    return {
      content: [{
        type: 'text',
        text: `Directory created: ${args.path}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'create_directory');
    logger.error({ error: mcpError, args }, 'create_directory failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const createDirectoryToolDefinition = {
  name: 'create_directory',
  description: 'Create a new directory with optional recursive parent creation. Validates against allowed directories.',
  inputSchema: CreateDirectorySchema,
};
