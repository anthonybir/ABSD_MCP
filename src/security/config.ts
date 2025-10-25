import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigSchema, type Config } from '../types/config.js';

export function loadConfig(configPath?: string): Config {
  const path = configPath || process.env.ABSD_MCP_CONFIG || resolve(process.cwd(), 'config.json');

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return ConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Config file no encontrado: ${path}\n` +
        'Crea config.json o establece ABSD_MCP_CONFIG'
      );
    }
    throw error;
  }
}

export function createDefaultConfig(allowedDirs: string[]): Config {
  return ConfigSchema.parse({
    allowedDirectories: allowedDirs,
    blockedCommands: [
      'rm -rf /',
      'dd if=/dev/zero',
      'mkfs',
      'shutdown',
      'reboot',
      'init 0',
    ],
  });
}
