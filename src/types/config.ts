import { z } from 'zod';

export const ConfigSchema = z.object({
  allowedDirectories: z.array(z.string()).min(1, 'Al menos un directorio permitido requerido'),
  blockedCommands: z.array(z.string()).default([]),
  fileReadLineLimit: z.number().positive().default(1000),
  fileWriteLineLimit: z.number().positive().default(50),
  sessionTimeout: z.number().positive().default(30 * 60 * 1000), // 30 min
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export const ToolResultSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string(),
    })
  ),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;
