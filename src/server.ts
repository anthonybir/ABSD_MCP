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

// Import resources and prompts
import { getResourceDefinitions, getResourceContent } from './resources/index.js';
import { getPromptDefinitions, getPromptMessages } from './prompts/index.js';

// Import meta tools
import { getConfigTool, getConfigToolDefinition, type GetConfigArgs } from './tools/meta/get-config.js';

// Import filesystem tools
import { readFileTool, readFileToolDefinition, type ReadFileArgs } from './tools/filesystem/read.js';
import { readMultipleFilesTool, readMultipleFilesToolDefinition, type ReadMultipleFilesArgs } from './tools/filesystem/read-multiple.js';
import { writeFileTool, writeFileToolDefinition, type WriteFileArgs } from './tools/filesystem/write.js';
import { listDirectoryTool, listDirectoryToolDefinition, type ListDirectoryArgs } from './tools/filesystem/list.js';
import { createDirectoryTool, createDirectoryToolDefinition, type CreateDirectoryArgs } from './tools/filesystem/create.js';
import { getFileInfoTool, getFileInfoToolDefinition, type GetFileInfoArgs } from './tools/filesystem/info.js';
import { searchFilesTool, searchFilesToolDefinition, type SearchFilesArgs } from './tools/filesystem/search.js';
import { editBlockTool, editBlockToolDefinition, type EditBlockArgs } from './tools/filesystem/edit.js';

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
import { interactWithProcessTool, interactWithProcessToolDefinition, type InteractArgs } from './tools/terminal/interact.js';
import {
  readProcessOutputTool,
  readProcessOutputToolDefinition,
  type ReadProcessOutputArgs,
  listSessionsTool,
  listSessionsToolDefinition,
  terminateProcessTool,
  terminateProcessToolDefinition,
  type TerminateProcessArgs
} from './tools/terminal/management.js';

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

  // Create server
  const server = new Server(
    {
      name: '@absd/devops-mcp',
      version: '0.1.0',
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
        // Filesystem tools
        readFileToolDefinition,
        readMultipleFilesToolDefinition,
        writeFileToolDefinition,
        listDirectoryToolDefinition,
        createDirectoryToolDefinition,
        getFileInfoToolDefinition,
        searchFilesToolDefinition,
        editBlockToolDefinition,
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
      ],
    };
  });

  // Register call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info({ tool: name, args }, 'Tool called');

    try {
      switch (name) {
        // Meta tools
        case 'get_config':
          return await getConfigTool(config);

        // Filesystem tools
        case 'read_file':
          return await readFileTool(args as ReadFileArgs, validator, logger, config);

        case 'read_multiple_files':
          return await readMultipleFilesTool(args as ReadMultipleFilesArgs, validator, logger);

        case 'write_file':
          return await writeFileTool(args as WriteFileArgs, validator, logger, config);

        case 'list_directory':
          return await listDirectoryTool(args as ListDirectoryArgs, validator, logger);

        case 'create_directory':
          return await createDirectoryTool(args as CreateDirectoryArgs, validator, logger);

        case 'get_file_info':
          return await getFileInfoTool(args as GetFileInfoArgs, validator, logger);

        case 'search_files':
          return await searchFilesTool(args as SearchFilesArgs, validator, logger);

        case 'edit_block':
          return await editBlockTool(args as EditBlockArgs, validator, logger);

        // Streaming search tools
        case 'start_search':
          return await startSearchTool(args as StartSearchArgs, validator, logger, searchManager);

        case 'get_more_search_results':
          return await getMoreSearchResultsTool(args as GetMoreSearchResultsArgs, logger, searchManager);

        case 'stop_search':
          return await stopSearchTool(args as StopSearchArgs, logger, searchManager);

        case 'list_searches':
          return await listSearchesTool(logger, searchManager);

        // Terminal tools
        case 'start_process':
          return await startProcessTool(args as StartProcessArgs, sessionManager, validator, logger);

        case 'interact_with_process':
          return await interactWithProcessTool(args as InteractArgs, sessionManager, logger);

        case 'read_process_output':
          return await readProcessOutputTool(args as ReadProcessOutputArgs, sessionManager, logger);

        case 'list_sessions':
          return await listSessionsTool(sessionManager, logger);

        case 'terminate_process':
          return await terminateProcessTool(args as TerminateProcessArgs, sessionManager, logger);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
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
