import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError, createNotFoundError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const ListDirectorySchema = z.object({
  path: z.string().describe('Absolute or relative path to the directory'),
  recursive: z.boolean().default(false).describe('Recursively list subdirectories'),
  maxDepth: z.number().int().positive().default(3).describe('Maximum recursion depth'),
});

export type ListDirectoryArgs = z.infer<typeof ListDirectorySchema>;

async function listRecursive(
  dirPath: string,
  basePath: string,
  depth: number,
  maxDepth: number
): Promise<string[]> {
  if (depth > maxDepth) {
    return [`[MAX_DEPTH] ${relative(basePath, dirPath)}`];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relativePath = relative(basePath, fullPath);

    if (entry.isDirectory()) {
      results.push(`[DIR] ${relativePath}`);
      if (depth < maxDepth) {
        const subResults = await listRecursive(fullPath, basePath, depth + 1, maxDepth);
        results.push(...subResults);
      }
    } else if (entry.isFile()) {
      results.push(`[FILE] ${relativePath}`);
    } else if (entry.isSymbolicLink()) {
      results.push(`[LINK] ${relativePath}`);
    }
  }

  return results;
}

export async function listDirectoryTool(
  args: ListDirectoryArgs,
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

    // Verify it's a directory
    const stats = await stat(validPath).catch((error) => {
      if (error.code === 'ENOENT') {
        throw createNotFoundError(args.path);
      }
      throw error;
    });

    if (!stats.isDirectory()) {
      return {
        content: [{
          type: 'text',
          text: `Error: Path is not a directory: ${args.path}`,
        }],
      };
    }

    // List directory
    let results: string[];
    if (args.recursive) {
      results = await listRecursive(validPath, validPath, 0, args.maxDepth);
    } else {
      const entries = await readdir(validPath, { withFileTypes: true });
      results = entries.map(entry => {
        const prefix = entry.isDirectory() ? '[DIR]' : entry.isFile() ? '[FILE]' : '[LINK]';
        return `${prefix} ${entry.name}`;
      });
    }

    logger.info({
      tool: 'list_directory',
      path: validPath,
      count: results.length,
      recursive: args.recursive,
    }, 'Directory listed successfully');

    return {
      content: [{
        type: 'text',
        text: results.join('\n'),
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'list_directory');
    logger.error({ error: mcpError, args }, 'list_directory failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const listDirectoryToolDefinition = {
  name: 'list_directory',
  description: 'List contents of a directory. Supports recursive listing with configurable depth. Files are prefixed with [FILE], directories with [DIR].',
  inputSchema: ListDirectorySchema,
};
