import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';

const execAsync = promisify(exec);

const SearchFilesSchema = z.object({
  pattern: z.string().describe('Pattern to search for (regex by default, literal if literalSearch=true)'),
  path: z.string().describe('Directory to search in'),
  literalSearch: z.boolean().default(false).describe('Treat pattern as literal string instead of regex'),
  filePattern: z.string().optional().describe('Filter files by glob pattern (e.g., "*.ts", "*.{js,jsx}")'),
  maxResults: z.number().int().positive().default(100).describe('Maximum number of results to return'),
  contextLines: z.number().int().nonnegative().default(0).describe('Number of context lines before/after matches'),
  ignoreCase: z.boolean().default(false).describe('Case-insensitive search'),
});

export type SearchFilesArgs = z.infer<typeof SearchFilesSchema>;

interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export async function searchFilesTool(
  args: SearchFilesArgs,
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

    // Check if ripgrep is available
    try {
      await execAsync('which rg');
    } catch {
      return {
        content: [{
          type: 'text',
          text: 'Error: ripgrep (rg) not found. Install with: brew install ripgrep (macOS) or apt install ripgrep (Linux)',
        }],
      };
    }

    // Build ripgrep command
    const rgArgs: string[] = [
      '--json', // JSON output for parsing
      '--max-count', args.maxResults.toString(),
    ];

    if (args.literalSearch) {
      rgArgs.push('--fixed-strings'); // Literal search
    }

    if (args.ignoreCase) {
      rgArgs.push('--ignore-case');
    }

    if (args.contextLines > 0) {
      rgArgs.push('--before-context', args.contextLines.toString());
      rgArgs.push('--after-context', args.contextLines.toString());
    }

    if (args.filePattern) {
      rgArgs.push('--glob', args.filePattern);
    }

    // Add pattern and path
    rgArgs.push('--', args.pattern, validPath);

    const command = `rg ${rgArgs.join(' ')}`;

    // Execute ripgrep
    let stdout = '';
    try {
      const result = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      stdout = result.stdout;
    } catch (error: any) {
      // ripgrep exits with code 1 when no matches found
      if (error.code === 1) {
        return {
          content: [{
            type: 'text',
            text: `No matches found for pattern: ${args.pattern}`,
          }],
        };
      }
      throw error;
    }

    // Parse JSON output
    const results: SearchResult[] = [];
    const lines = stdout.trim().split('\n').filter(l => l);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === 'match') {
          const data = entry.data;
          results.push({
            file: data.path.text,
            line: data.line_number,
            column: data.submatches[0]?.start || 0,
            match: data.lines.text.trim(),
          });
        }
      } catch {
        // Skip malformed JSON lines
        continue;
      }
    }

    // Format output
    const output = results.map((r, i) => {
      return `[${i + 1}] ${r.file}:${r.line}:${r.column}
${r.match}`;
    }).join('\n\n');

    logger.info({
      tool: 'search_files',
      pattern: args.pattern,
      path: validPath,
      matches: results.length,
    }, 'Search completed');

    return {
      content: [{
        type: 'text',
        text: results.length > 0
          ? `Found ${results.length} matches:\n\n${output}`
          : `No matches found for pattern: ${args.pattern}`,
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'search_files');
    logger.error({ error: mcpError, args }, 'search_files failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const searchFilesToolDefinition = {
  name: 'search_files',
  description: 'Search for patterns in files using ripgrep. Supports regex, literal search, file filtering, and context lines. Fast and efficient for large codebases.',
  inputSchema: SearchFilesSchema,
};
