import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SecurityValidator } from './security/validator.js';
import { loadConfig } from './security/config.js';
import { createLogger } from './utils/logger.js';
import { wrapError } from './utils/errors.js';
import { SERVER_VERSION } from './version.js';

// Import resources and prompts
import { getResourceDefinitions, getResourceContent } from './resources/index.js';
import { getPromptDefinitions, getPromptMessages } from './prompts/index.js';

// Import meta tools
import { getConfigTool, getConfigToolDefinition, type GetConfigArgs } from './tools/meta/get-config.js';
import {
  getUsageStatsTool,
  getUsageStatsToolDefinition,
  UsageTracker,
  type GetUsageStatsArgs
} from './tools/meta/usage-stats.js';

// Import filesystem tools
import { readFileTool, readFileToolDefinition, type ReadFileArgs } from './tools/filesystem/read.js';
import { readMultipleFilesTool, readMultipleFilesToolDefinition, type ReadMultipleFilesArgs } from './tools/filesystem/read-multiple.js';
import { writeFileTool, writeFileToolDefinition, type WriteFileArgs } from './tools/filesystem/write.js';
import { listDirectoryTool, listDirectoryToolDefinition, type ListDirectoryArgs } from './tools/filesystem/list.js';
import { createDirectoryTool, createDirectoryToolDefinition, type CreateDirectoryArgs } from './tools/filesystem/create.js';
import { getFileInfoTool, getFileInfoToolDefinition, type GetFileInfoArgs } from './tools/filesystem/info.js';
import { searchFilesTool, searchFilesToolDefinition, type SearchFilesArgs } from './tools/filesystem/search.js';
import { editBlockTool, editBlockToolDefinition, type EditBlockArgs } from './tools/filesystem/edit.js';
import { moveFileTool, moveFileToolDefinition, type MoveFileArgs } from './tools/filesystem/move.js';

// Import streaming search
import { SearchSessionManager } from './tools/filesystem/search-manager.js';
import {
  startSearchTool,
  startSearchToolDefinition,
  type StartSearchArgs,
  getMoreSearchResultsTool,
  getMoreSearchResultsToolDefinition,
  type GetMoreSearchResultsArgs,
  stopSearchTool,
  stopSearchToolDefinition,
  type StopSearchArgs,
  listSearchesTool,
  listSearchesToolDefinition,
} from './tools/filesystem/search-streaming.js';

// Import terminal tools
import { SessionManager } from './tools/terminal/session.js';
import { startProcessTool, startProcessToolDefinition, type StartProcessArgs } from './tools/terminal/process.js';
import {
  interactWithProcessTool,
  interactWithProcessToolDefinition,
  InteractSchema,
  type InteractArgs
} from './tools/terminal/interact.js';
import {
  readProcessOutputTool,
  readProcessOutputToolDefinition,
  ReadProcessOutputSchema,
  type ReadProcessOutputArgs,
  listSessionsTool,
  listSessionsToolDefinition,
  terminateProcessTool,
  terminateProcessToolDefinition,
  TerminateProcessSchema,
  type TerminateProcessArgs
} from './tools/terminal/management.js';
import {
  listProcessesTool,
  listProcessesToolDefinition,
  killProcessTool,
  killProcessToolDefinition,
  type KillProcessArgs
} from './tools/terminal/system.js';

export function createServer(configPath?: string) {
  // Load configuration
  const config = loadConfig(configPath);
  const logger = createLogger(config);

  // FAIL FAST: Check for unsafe configuration
  if (config.allowedDirectories.length === 0 && config.blockedCommands.length === 0) {
    logger.error('FATAL: allowedDirectories AND blockedCommands are empty');
    logger.error('This configuration removes ALL security guardrails');
    logger.error('Add blockedCommands or restrict allowedDirectories');
    throw new Error('Unsafe configuration: No security constraints defined');
  }

  const validator = new SecurityValidator(config, logger);

  // Create session manager for terminal tools
  const sessionManager = new SessionManager(logger, config.sessionTimeout);

  // Create search session manager for streaming search
  const searchManager = new SearchSessionManager(logger);

  // Create usage tracker for stats (in-memory, resets on restart)
  const usageTracker = new UsageTracker();

  // Create server
  const server = new Server(
    {
      name: '@absd/devops-mcp',
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Register list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('ListTools requested');

    return {
      tools: [
        // Meta tools
        getConfigToolDefinition,
        getUsageStatsToolDefinition,
        // Filesystem tools
        readFileToolDefinition,
        readMultipleFilesToolDefinition,
        writeFileToolDefinition,
        listDirectoryToolDefinition,
        createDirectoryToolDefinition,
        getFileInfoToolDefinition,
        searchFilesToolDefinition,
        editBlockToolDefinition,
        moveFileToolDefinition,
        // Streaming search tools
        startSearchToolDefinition,
        getMoreSearchResultsToolDefinition,
        stopSearchToolDefinition,
        listSearchesToolDefinition,
        // Terminal tools
        startProcessToolDefinition,
        interactWithProcessToolDefinition,
        readProcessOutputToolDefinition,
        listSessionsToolDefinition,
        terminateProcessToolDefinition,
        listProcessesToolDefinition,
        killProcessToolDefinition,
      ],
    };
  });

  // Register call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info({ tool: name, args }, 'Tool called');

    try {
      // Execute tool and store result
      let result: ToolResult;

      switch (name) {
        // Meta tools
        case 'get_config':
          result = await getConfigTool(config);
          break;

        case 'get_usage_stats':
          result = await getUsageStatsTool(usageTracker, sessionManager, searchManager, logger);
          break;

        // Filesystem tools
        case 'read_file':
          result = await readFileTool(args as ReadFileArgs, validator, logger, config);
          break;

        case 'read_multiple_files':
          result = await readMultipleFilesTool(args as ReadMultipleFilesArgs, validator, logger);
          break;

        case 'write_file':
          result = await writeFileTool(args as WriteFileArgs, validator, logger, config);
          break;

        case 'list_directory':
          result = await listDirectoryTool(args as ListDirectoryArgs, validator, logger);
          break;

        case 'create_directory':
          result = await createDirectoryTool(args as CreateDirectoryArgs, validator, logger);
          break;

        case 'get_file_info':
          result = await getFileInfoTool(args as GetFileInfoArgs, validator, logger);
          break;

        case 'search_files':
          result = await searchFilesTool(args as SearchFilesArgs, validator, logger);
          break;

        case 'edit_block':
          result = await editBlockTool(args as EditBlockArgs, validator, logger);
          break;

        case 'move_file':
          result = await moveFileTool(args as MoveFileArgs, validator, logger);
          break;

        // Streaming search tools
        case 'start_search':
          result = await startSearchTool(args as StartSearchArgs, validator, logger, searchManager);
          break;

        case 'get_more_search_results':
          result = await getMoreSearchResultsTool(args as GetMoreSearchResultsArgs, logger, searchManager);
          break;

        case 'stop_search':
          result = await stopSearchTool(args as StopSearchArgs, logger, searchManager);
          break;

        case 'list_searches':
          result = await listSearchesTool(logger, searchManager);
          break;

        // Terminal tools
        case 'start_process':
          result = await startProcessTool(args as StartProcessArgs, sessionManager, validator, logger);
          break;

        case 'interact_with_process': {
          const validatedArgs = InteractSchema.parse(args);
          result = await interactWithProcessTool(validatedArgs, sessionManager, logger);
          break;
        }

        case 'read_process_output': {
          const validatedArgs = ReadProcessOutputSchema.parse(args);
          result = await readProcessOutputTool(validatedArgs, sessionManager, logger);
          break;
        }

        case 'list_sessions':
          result = await listSessionsTool(sessionManager, logger);
          break;

        case 'terminate_process': {
          const validatedArgs = TerminateProcessSchema.parse(args);
          result = await terminateProcessTool(validatedArgs, sessionManager, logger);
          break;
        }

        case 'list_processes':
          result = await listProcessesTool(logger);
          break;

        case 'kill_process':
          result = await killProcessTool(args as KillProcessArgs, logger);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      // Only increment usage counter on successful execution (not in catch block)
      usageTracker.incrementToolCall(name);

      return result;
    } catch (error) {
      const mcpError = wrapError(error, `Tool ${name}`);
      logger.error({ error: mcpError, tool: name, args }, 'Tool execution failed');

      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${mcpError.message}`,
        }],
      };
    }
  });

  // Register resources handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.debug('ListResources requested');
    return {
      resources: getResourceDefinitions(),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    logger.info({ uri }, 'ReadResource requested');

    const content = getResourceContent(uri, config, sessionManager);
    if (!content) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return {
      contents: [{
        uri,
        mimeType: content.mimeType,
        text: content.text,
      }],
    };
  });

  // Register prompts handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    logger.debug('ListPrompts requested');
    return {
      prompts: getPromptDefinitions(),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info({ name, args }, 'GetPrompt requested');

    const messages = getPromptMessages(name, args || {});
    if (!messages) {
      throw new Error(`Prompt not found: ${name}`);
    }

    return {
      messages,
    };
  });

  logger.info({
    allowedDirectories: config.allowedDirectories,
    blockedCommands: config.blockedCommands,
    logLevel: config.logLevel,
  }, 'Server initialized');

  return { server, logger, sessionManager, searchManager };
}
