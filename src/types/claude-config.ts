import { z } from 'zod';

/**
 * Schema for a single MCP server entry in Claude Desktop config
 * Permissive schema - allows any object structure for maximum compatibility
 */
export const ClaudeMcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
}).passthrough(); // Allow additional fields

export type ClaudeMcpServer = z.infer<typeof ClaudeMcpServerSchema>;

/**
 * Schema for Claude Desktop config file
 * Uses .passthrough() to allow other keys (window state, theme, etc.)
 * Very permissive to handle different Claude Desktop versions
 */
export const ClaudeConfigSchema = z
  .object({
    mcpServers: z.record(z.unknown()).optional(), // Use z.unknown() for maximum compatibility
  })
  .passthrough();

export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
