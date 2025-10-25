import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError, createNotFoundError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const EditBlockSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file'),
  oldString: z.string().describe('Exact text to find and replace (must be unique unless replaceAll=true)'),
  newString: z.string().describe('Replacement text'),
  replaceAll: z.boolean().default(false).describe('Replace all occurrences (default: false, requires exact single match)'),
});

export type EditBlockArgs = z.infer<typeof EditBlockSchema>;

/**
 * Count occurrences of a string in text
 */
function countOccurrences(text: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

export async function editBlockTool(
  args: EditBlockArgs,
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

    // Read file
    const content = await readFile(validPath, 'utf-8').catch((error) => {
      if (error.code === 'ENOENT') {
        throw createNotFoundError(args.path);
      }
      throw error;
    });

    // Count occurrences
    const occurrences = countOccurrences(content, args.oldString);

    if (occurrences === 0) {
      return {
        content: [{
          type: 'text',
          text: `Error: Pattern not found in file: "${args.oldString.slice(0, 50)}${args.oldString.length > 50 ? '...' : ''}"`,
        }],
      };
    }

    if (!args.replaceAll && occurrences > 1) {
      return {
        content: [{
          type: 'text',
          text: `Error: Pattern found ${occurrences} times but replaceAll=false. The pattern must be unique for safety.
Found pattern at multiple locations. Either:
1. Make the pattern more specific to match only one location
2. Use replaceAll=true to replace all ${occurrences} occurrences

Pattern: "${args.oldString.slice(0, 100)}${args.oldString.length > 100 ? '...' : ''}"`,
        }],
      };
    }

    // Perform replacement
    const newContent = args.replaceAll
      ? content.split(args.oldString).join(args.newString)
      : content.replace(args.oldString, args.newString);

    // Write back
    await writeFile(validPath, newContent, 'utf-8');

    const replaced = args.replaceAll ? occurrences : 1;
    const oldLines = args.oldString.split('\n').length;
    const newLines = args.newString.split('\n').length;
    const lineDelta = newLines - oldLines;

    logger.info({
      tool: 'edit_block',
      path: validPath,
      replaced,
      oldLines,
      newLines,
      lineDelta,
    }, 'File edited successfully');

    return {
      content: [{
        type: 'text',
        text: `Successfully edited ${args.path}
Replaced: ${replaced} occurrence${replaced > 1 ? 's' : ''}
Lines changed: ${oldLines} → ${newLines} (${lineDelta >= 0 ? '+' : ''}${lineDelta})

Old text (${args.oldString.length} chars):
${args.oldString.slice(0, 200)}${args.oldString.length > 200 ? '...' : ''}

New text (${args.newString.length} chars):
${args.newString.slice(0, 200)}${args.newString.length > 200 ? '...' : ''}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'edit_block');
    logger.error({ error: mcpError, args }, 'edit_block failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const editBlockToolDefinition = {
  name: 'edit_block',
  description: 'Surgically edit a file by replacing exact text blocks. Requires unique match unless replaceAll=true. Perfect for precise code modifications.',
  inputSchema: EditBlockSchema,
};
