import { describe, it, expect } from 'vitest';
import { getConfigTool } from '../../src/tools/meta/get-config.js';
import type { Config } from '../../src/types/config.js';

describe('get_config tool', () => {
  const baseConfig: Config = {
    allowedDirectories: ['/test/path1', '/test/path2'],
    blockedCommands: ['rm -rf /', 'shutdown'],
    fileReadLineLimit: 2000,
    fileWriteLineLimit: 75,
    sessionTimeout: 1800000,
    logLevel: 'info',
    urlDenylist: ['localhost', '127.0.0.1'],
    urlTimeout: 10000,
  };

  it('should return config with security metadata for restricted access', async () => {
    const result = await getConfigTool(baseConfig);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('ABSD MCP Server Configuration');
    expect(text).toContain('RESTRICTED');
    expect(text).toContain('/test/path1');
    expect(text).toContain('/test/path2');
    expect(text).toContain('rm -rf /');
    expect(text).toContain('shutdown');
    expect(text).toContain('read-only');

    // Parse JSON from text to verify structure
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();
    const parsedConfig = JSON.parse(jsonMatch![0]);

    expect(parsedConfig.allowedDirectories).toEqual(['/test/path1', '/test/path2']);
    expect(parsedConfig.blockedCommands).toEqual(['rm -rf /', 'shutdown']);
    expect(parsedConfig.fileReadLineLimit).toBe(2000);
    expect(parsedConfig.fileWriteLineLimit).toBe(75);
    expect(parsedConfig.sessionTimeout).toBe(1800000);
    expect(parsedConfig.logLevel).toBe('info');
    expect(parsedConfig.version).toBe('0.3.7'); // Dynamically loaded from package.json
    expect(parsedConfig.security.hasUnrestrictedAccess).toBe(false);
    expect(parsedConfig.security.totalAllowedPaths).toBe(2);
    expect(parsedConfig.security.totalBlockedCommands).toBe(2);
    expect(parsedConfig.security.warning).toBeNull();
  });

  it('should show UNRESTRICTED status when allowedDirectories is empty', async () => {
    const unrestrictedConfig: Config = {
      ...baseConfig,
      allowedDirectories: [],
      blockedCommands: ['rm -rf /', 'shutdown'], // Still have some blockedCommands
    };

    const result = await getConfigTool(unrestrictedConfig);
    const text = result.content[0].text;

    expect(text).toContain('UNRESTRICTED ACCESS');
    expect(text).toContain('DANGEROUS');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsedConfig = JSON.parse(jsonMatch![0]);

    expect(parsedConfig.allowedDirectories).toEqual([]);
    expect(parsedConfig.security.hasUnrestrictedAccess).toBe(true);
    expect(parsedConfig.security.totalAllowedPaths).toBe(0);
    expect(parsedConfig.security.status).toContain('UNRESTRICTED');
    expect(parsedConfig.security.warning).toContain('⚠️ WARNING');
    expect(parsedConfig.security.warning).toContain('Unrestricted filesystem access');
  });

  it('should include platform and node version metadata', async () => {
    const result = await getConfigTool(baseConfig);
    const text = result.content[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsedConfig = JSON.parse(jsonMatch![0]);

    expect(parsedConfig.platform).toBe(process.platform);
    expect(parsedConfig.nodeVersion).toBe(process.version);
  });

  it('should indicate read-only nature of config', async () => {
    const result = await getConfigTool(baseConfig);
    const text = result.content[0].text;

    expect(text).toContain('read-only');
    expect(text).toContain('restart server');
  });

  it('should handle empty blockedCommands list', async () => {
    const noBlockedConfig: Config = {
      ...baseConfig,
      blockedCommands: [],
    };

    const result = await getConfigTool(noBlockedConfig);
    const text = result.content[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsedConfig = JSON.parse(jsonMatch![0]);

    expect(parsedConfig.blockedCommands).toEqual([]);
    expect(parsedConfig.security.totalBlockedCommands).toBe(0);
  });
});
