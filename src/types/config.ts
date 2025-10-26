import { z } from 'zod';

export const ConfigSchema = z.object({
  allowedDirectories: z.array(z.string()).default([]),
  blockedCommands: z.array(z.string()).default([]),
  fileReadLineLimit: z.number().positive().default(1000),
  fileWriteLineLimit: z.number().positive().default(50),
  sessionTimeout: z.number().positive().default(30 * 60 * 1000), // 30 min
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // URL fetch configuration
  urlDenylist: z.array(z.string()).default([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
  ]),
  urlTimeout: z.number().positive().default(10000), // 10 seconds
});

export type Config = z.infer<typeof ConfigSchema>;

// Content types for MCP tool results
const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const ImageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string(), // base64 encoded
  mimeType: z.string(),
});

export const ToolResultSchema = z.object({
  content: z.array(z.union([TextContentSchema, ImageContentSchema])),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;
