import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { moveFileTool } from '../../src/tools/filesystem/move.js';
import { SecurityValidator } from '../../src/security/validator.js';
import type { Config } from '../../src/types/config.js';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, rmSync, realpathSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('move_file tool', () => {
  let testDir: string;
  let validator: SecurityValidator;
  let mockLogger: any;

  beforeEach(() => {
    // Create temp test directory
    testDir = join(tmpdir(), `absd-mcp-test-move-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Resolve symlinks AFTER directory creation (macOS /tmp -> /private/var/folders)
    testDir = realpathSync(testDir);

    // Mock logger
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const config: Config = {
      // Use resolved path for config to handle macOS symlinks
      allowedDirectories: [testDir],
      blockedCommands: [],
      fileReadLineLimit: 1000,
      fileWriteLineLimit: 50,
      sessionTimeout: 30000,
      logLevel: 'error',
      urlDenylist: [],
      urlTimeout: 10000,
    };

    validator = new SecurityValidator(config, mockLogger);
  });

  afterEach(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Successful moves', () => {
    it('should move a file successfully', async () => {
      const sourcePath = join(testDir, 'source.txt');
      const destPath = join(testDir, 'destination.txt');
      writeFileSync(sourcePath, 'Test content');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Successfully moved');

      // Verify file was moved (source no longer exists, destination exists)
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(destPath)).toBe(true);
      expect(readFileSync(destPath, 'utf-8')).toBe('Test content');
    });

    it('should rename a file in the same directory', async () => {
      const sourcePath = join(testDir, 'old-name.txt');
      const destPath = join(testDir, 'new-name.txt');
      writeFileSync(sourcePath, 'Rename test');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].text).toContain('Successfully moved');
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(destPath)).toBe(true);
      expect(readFileSync(destPath, 'utf-8')).toBe('Rename test');
    });

    it('should move a file to a subdirectory', async () => {
      const sourcePath = join(testDir, 'file.txt');
      const subdir = join(testDir, 'subdir');
      mkdirSync(subdir, { recursive: true });
      const destPath = join(subdir, 'file.txt');
      writeFileSync(sourcePath, 'Move to subdir');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].text).toContain('Successfully moved');
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(destPath)).toBe(true);
      expect(readFileSync(destPath, 'utf-8')).toBe('Move to subdir');
    });

    it('should move a directory', async () => {
      const sourceDir = join(testDir, 'source-dir');
      const destDir = join(testDir, 'dest-dir');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, 'file.txt'), 'Content in directory');

      const result = await moveFileTool(
        { source: sourceDir, destination: destDir },
        validator,
        mockLogger
      );

      expect(result.content[0].text).toContain('Successfully moved');
      expect(existsSync(sourceDir)).toBe(false);
      expect(existsSync(destDir)).toBe(true);
      expect(existsSync(join(destDir, 'file.txt'))).toBe(true);
    });

    it('should overwrite destination file if it exists', async () => {
      const sourcePath = join(testDir, 'source.txt');
      const destPath = join(testDir, 'destination.txt');
      writeFileSync(sourcePath, 'New content');
      writeFileSync(destPath, 'Old content');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].text).toContain('Successfully moved');
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(destPath)).toBe(true);
      expect(readFileSync(destPath, 'utf-8')).toBe('New content');
    });
  });

  describe('Security validation', () => {
    it('should reject source path outside allowed directories', async () => {
      const sourcePath = '/tmp/outside-allowed.txt';
      const destPath = join(testDir, 'destination.txt');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error (source)');
    });

    it('should reject destination path outside allowed directories', async () => {
      const sourcePath = join(testDir, 'source.txt');
      const destPath = '/tmp/outside-allowed.txt';
      writeFileSync(sourcePath, 'Test');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error (destination)');

      // Source should still exist since move failed
      expect(existsSync(sourcePath)).toBe(true);
    });

    it('should reject path traversal attempts in source', async () => {
      const sourcePath = join(testDir, '../../../etc/passwd');
      const destPath = join(testDir, 'destination.txt');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].text).toContain('Error (source)');
    });

    it('should reject path traversal attempts in destination', async () => {
      const sourcePath = join(testDir, 'source.txt');
      const destPath = join(testDir, '../../../tmp/evil.txt');
      writeFileSync(sourcePath, 'Test');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].text).toContain('Error (destination)');
      expect(existsSync(sourcePath)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent source file', async () => {
      const sourcePath = join(testDir, 'nonexistent.txt');
      const destPath = join(testDir, 'destination.txt');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error:');
    });

    it('should handle moving to non-existent directory', async () => {
      const sourcePath = join(testDir, 'source.txt');
      const destPath = join(testDir, 'nonexistent-dir', 'destination.txt');
      writeFileSync(sourcePath, 'Test');

      const result = await moveFileTool(
        { source: sourcePath, destination: destPath },
        validator,
        mockLogger
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error:');

      // Source should still exist since move failed
      expect(existsSync(sourcePath)).toBe(true);
    });
  });
});
