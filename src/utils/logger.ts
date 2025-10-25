import pino from 'pino';
import type { Config } from '../types/config.js';

/**
 * Create a configured logger instance
 * CRITICAL: MCP servers use stdout for JSON-RPC protocol messages
 * ALL logs MUST go to stderr to avoid protocol corruption
 */
export function createLogger(config: Config) {
  return pino(
    {
      level: config.logLevel,
    },
    pino.destination({ dest: 2, sync: false }) // fd 2 = stderr
  );
}

export type Logger = ReturnType<typeof createLogger>;
