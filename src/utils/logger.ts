import pino from 'pino';
import type { Config } from '../types/config.js';

/**
 * Create a configured logger instance
 */
export function createLogger(config: Config) {
  return pino({
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
