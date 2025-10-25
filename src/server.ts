import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SecurityValidator } from './security/validator.js';
import { loadConfig } from './security/config.js';
import { createLogger } from './utils/logger.js';
import { wrapError } from './utils/errors.js';

// Import filesystem tools
import { readFileTool, readFileToolDefinition, type ReadFileArgs } from './tools/filesystem/read.js';
import { writeFileTool, writeFileToolDefinition, type WriteFileArgs } from './tools/filesystem/write.js';
import { listDirectoryTool, listDirectoryToolDefinition, type ListDirectoryArgs } from './tools/filesystem/list.js';
import { createDirectoryTool, createDirectoryToolDefinition, type CreateDirectoryArgs } from './tools/filesystem/create.js';
import { getFileInfoTool, getFileInfoToolDefinition, type GetFileInfoArgs } from './tools/filesystem/info.js';

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
  const validator = new SecurityValidator(config);

  // Create session manager for terminal tools
  const sessionManager = new SessionManager(logger, config.sessionTimeout);

  // Create server
  const server = new Server(
    {
      name: '@absd/devops-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('ListTools requested');

    return {
      tools: [
        // Filesystem tools
        readFileToolDefinition,
        writeFileToolDefinition,
        listDirectoryToolDefinition,
        createDirectoryToolDefinition,
        getFileInfoToolDefinition,
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
        // Filesystem tools
        case 'read_file':
          return await readFileTool(args as ReadFileArgs, validator, logger, config);

        case 'write_file':
          return await writeFileTool(args as WriteFileArgs, validator, logger, config);

        case 'list_directory':
          return await listDirectoryTool(args as ListDirectoryArgs, validator, logger);

        case 'create_directory':
          return await createDirectoryTool(args as CreateDirectoryArgs, validator, logger);

        case 'get_file_info':
          return await getFileInfoTool(args as GetFileInfoArgs, validator, logger);

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

  logger.info({
    allowedDirectories: config.allowedDirectories,
    blockedCommands: config.blockedCommands,
    logLevel: config.logLevel,
  }, 'Server initialized');

  return { server, logger };
}
