import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SecurityValidator } from './security/validator.js';
import { loadConfig } from './security/config.js';
import { createLogger } from './utils/logger.js';
import { wrapError } from './utils/errors.js';

// Import tools
import { readFileTool, readFileToolDefinition, type ReadFileArgs } from './tools/filesystem/read.js';
import { writeFileTool, writeFileToolDefinition, type WriteFileArgs } from './tools/filesystem/write.js';
import { listDirectoryTool, listDirectoryToolDefinition, type ListDirectoryArgs } from './tools/filesystem/list.js';

export function createServer(configPath?: string) {
  // Load configuration
  const config = loadConfig(configPath);
  const logger = createLogger(config);
  const validator = new SecurityValidator(config);

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
        readFileToolDefinition,
        writeFileToolDefinition,
        listDirectoryToolDefinition,
      ],
    };
  });

  // Register call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info({ tool: name, args }, 'Tool called');

    try {
      switch (name) {
        case 'read_file':
          return await readFileTool(args as ReadFileArgs, validator, logger, config);

        case 'write_file':
          return await writeFileTool(args as WriteFileArgs, validator, logger, config);

        case 'list_directory':
          return await listDirectoryTool(args as ListDirectoryArgs, validator, logger);

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
