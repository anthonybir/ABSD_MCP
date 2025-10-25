import { defineConfig } from 'tsup';

export default defineConfig([
  // Main MCP server bundle
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    clean: true,
    minify: true,
    outDir: 'dist',
    platform: 'node',
  },
  // Lifecycle scripts (with shebang banner, no minify for debugging)
  {
    entry: {
      'scripts/register-claude-config': 'scripts/register-claude-config.ts',
      'scripts/unregister-claude-config': 'scripts/unregister-claude-config.ts',
    },
    format: ['esm'],
    outDir: 'dist',
    minify: false,
    platform: 'node',
    external: ['readline/promises'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
