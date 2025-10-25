#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  // Get config path from environment or use default
  const configPath = process.env.ABSD_MCP_CONFIG;

  // Create server
  const { server, logger } = createServer(configPath);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  logger.info('ABSD DevOps MCP Server running on stdio');

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down server...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
