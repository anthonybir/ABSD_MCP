import { z } from 'zod';
import type { Logger } from 'pino';
import type { ToolResult } from '../../types/config.js';
import type { SearchSessionManager } from './search-manager.js';
import { SecurityValidator } from '../../security/validator.js';

// ============================================================================
// start_search
// ============================================================================

export const StartSearchSchema = z.object({
  path: z.string().describe('Directory path to search in'),
  pattern: z.string().describe('Search pattern (filename pattern for files, regex/literal for content)'),
  searchType: z.enum(['files', 'content']).default('files').describe('Search type: files or content'),
  filePattern: z.string().optional().describe('File glob pattern to filter (e.g., "*.ts", "*.{js,ts}")'),
  ignoreCase: z.boolean().default(true).describe('Case-insensitive search'),
  literalSearch: z.boolean().default(false).describe('Treat pattern as literal string (not regex)'),
  contextLines: z.number().int().min(0).max(10).default(0).describe('Lines of context for content search'),
  maxResults: z.number().int().positive().optional().describe('Maximum number of results'),
  timeout: z.number().int().positive().optional().describe('Search timeout in milliseconds'),
});

export type StartSearchArgs = z.infer<typeof StartSearchSchema>;

export const startSearchToolDefinition = {
  name: 'start_search',
  description: 'Start a streaming background search using ripgrep. Returns immediately with session ID. ' +
               'Use get_more_search_results to retrieve results progressively. ' +
               'searchType="files" finds files by name, searchType="content" searches inside files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to search in',
      },
      pattern: {
        type: 'string',
        description: 'Search pattern (filename pattern for files, regex/literal for content)',
      },
      searchType: {
        type: 'string',
        enum: ['files', 'content'],
        description: 'Search type: files or content',
        default: 'files',
      },
      filePattern: {
        type: 'string',
        description: 'File glob pattern to filter (e.g., "*.ts", "*.{js,ts}")',
      },
      ignoreCase: {
        type: 'boolean',
        description: 'Case-insensitive search',
        default: true,
      },
      literalSearch: {
        type: 'boolean',
        description: 'Treat pattern as literal string (not regex)',
        default: false,
      },
      contextLines: {
        type: 'number',
        description: 'Lines of context for content search (0-10)',
        default: 0,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results',
      },
      timeout: {
        type: 'number',
        description: 'Search timeout in milliseconds',
      },
    },
    required: ['path', 'pattern'],
  },
};

export async function startSearchTool(
  args: StartSearchArgs,
  validator: SecurityValidator,
  logger: Logger,
  searchManager: SearchSessionManager
): Promise<ToolResult> {
  try {
    const validated = StartSearchSchema.parse(args);

    // Validate path
    const pathValidation = validator.validatePath(validated.path);
    if (!pathValidation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${pathValidation.error}`,
        }],
      };
    }

    const validPath = pathValidation.resolvedPath!;

    // Start search
    const sessionId = await searchManager.startSearch({
      pattern: validated.pattern,
      searchPath: validPath,
      searchType: validated.searchType,
      filePattern: validated.filePattern,
      ignoreCase: validated.ignoreCase,
      literalSearch: validated.literalSearch,
      contextLines: validated.contextLines,
      maxResults: validated.maxResults,
      timeout: validated.timeout,
    });

    return {
      content: [{
        type: 'text',
        text: `Search started: ${sessionId}\n\n` +
              `Type: ${validated.searchType}\n` +
              `Pattern: "${validated.pattern}"\n` +
              `Path: ${validPath}\n\n` +
              `Use get_more_search_results with sessionId="${sessionId}" to retrieve results.`,
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, args }, 'start_search failed');
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`,
      }],
    };
  }
}

// ============================================================================
// get_more_search_results
// ============================================================================

export const GetMoreSearchResultsSchema = z.object({
  sessionId: z.string().describe('Search session ID from start_search'),
  offset: z.number().int().default(0).describe('Result offset (0-based, negative for tail)'),
  length: z.number().int().positive().default(100).describe('Maximum results to return'),
});

export type GetMoreSearchResultsArgs = z.infer<typeof GetMoreSearchResultsSchema>;

export const getMoreSearchResultsToolDefinition = {
  name: 'get_more_search_results',
  description: 'Get results from an active search with pagination. ' +
               'Supports offset-based reading: positive offset for ranges, negative for tail. ' +
               'Returns results, status, and whether more results are available.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Search session ID from start_search',
      },
      offset: {
        type: 'number',
        description: 'Result offset (0-based, negative for tail). Default: 0',
        default: 0,
      },
      length: {
        type: 'number',
        description: 'Maximum results to return. Default: 100',
        default: 100,
      },
    },
    required: ['sessionId'],
  },
};

export async function getMoreSearchResultsTool(
  args: GetMoreSearchResultsArgs,
  logger: Logger,
  searchManager: SearchSessionManager
): Promise<ToolResult> {
  try {
    const validated = GetMoreSearchResultsSchema.parse(args);
    const { sessionId, offset, length } = validated;

    const { results, total, status, hasMore } = searchManager.getResults(sessionId, offset, length);

    let text = `=== Search Results (Session: ${sessionId}) ===\n\n`;
    text += `Status: ${status}\n`;
    text += `Total results: ${total}\n`;
    text += `Returned: ${results.length}\n`;
    text += `Has more: ${hasMore ? 'Yes' : 'No'}\n\n`;

    if (results.length === 0) {
      text += status === 'running'
        ? '⏳ Search still running... No results yet.\n'
        : '✓ Search complete. No results found.\n';
    } else {
      text += '---\n\n';
      for (const result of results) {
        text += `📄 ${result.path}`;
        if (result.lineNumber !== undefined) {
          text += `:${result.lineNumber}`;
        }
        text += '\n';
        if (result.matchedText) {
          text += `   ${result.matchedText}\n`;
        }
        text += '\n';
      }
    }

    if (hasMore && status === 'running') {
      text += '⏳ Search still running. Call again for more results.\n';
    } else if (hasMore) {
      text += `📊 More results available. Use offset=${offset + length} to continue.\n`;
    }

    return {
      content: [{
        type: 'text',
        text,
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, args }, 'get_more_search_results failed');
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`,
      }],
    };
  }
}

// ============================================================================
// stop_search
// ============================================================================

export const StopSearchSchema = z.object({
  sessionId: z.string().describe('Search session ID to stop'),
});

export type StopSearchArgs = z.infer<typeof StopSearchSchema>;

export const stopSearchToolDefinition = {
  name: 'stop_search',
  description: 'Stop an active background search. Results remain available for reading.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Search session ID to stop',
      },
    },
    required: ['sessionId'],
  },
};

export async function stopSearchTool(
  args: StopSearchArgs,
  logger: Logger,
  searchManager: SearchSessionManager
): Promise<ToolResult> {
  try {
    const validated = StopSearchSchema.parse(args);
    searchManager.stopSearch(validated.sessionId);

    return {
      content: [{
        type: 'text',
        text: `Search stopped: ${validated.sessionId}\n\n` +
              `Results remain available via get_more_search_results.`,
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, args }, 'stop_search failed');
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`,
      }],
    };
  }
}

// ============================================================================
// list_searches
// ============================================================================

export const listSearchesToolDefinition = {
  name: 'list_searches',
  description: 'List all active search sessions with status and runtime.',
  inputSchema: z.object({}),
};

export async function listSearchesTool(
  logger: Logger,
  searchManager: SearchSessionManager
): Promise<ToolResult> {
  try {
    const searches = searchManager.listSearches();

    if (searches.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No active search sessions.',
        }],
      };
    }

    let text = `=== Active Search Sessions (${searches.length}) ===\n\n`;

    for (const search of searches) {
      text += `🔍 ${search.id}\n`;
      text += `   Type: ${search.searchType}\n`;
      text += `   Pattern: "${search.pattern}"\n`;
      text += `   Status: ${search.status}\n`;
      text += `   Results: ${search.resultCount}\n`;
      text += `   Runtime: ${(search.runtime / 1000).toFixed(1)}s\n`;
      text += '\n';
    }

    return {
      content: [{
        type: 'text',
        text,
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'list_searches failed');
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`,
      }],
    };
  }
}
