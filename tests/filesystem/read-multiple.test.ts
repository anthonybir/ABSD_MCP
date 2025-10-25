import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readMultipleFilesTool } from '../../src/tools/filesystem/read-multiple.js';
import { SecurityValidator } from '../../src/security/validator.js';
import type { Config } from '../../src/types/config.js';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

describe('read_multiple_files tool', () => {
  let testDir: string;
  let validator: SecurityValidator;
  let mockLogger: any;

  beforeEach(() => {
    // Create temp test directory
    testDir = join(tmpdir(), `absd-mcp-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Mock logger
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const config: Config = {
      // Use resolved path for config to handle macOS symlinks
      allowedDirectories: [realpathSync(testDir)],
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

  describe('Basic functionality', () => {
    it('should read multiple files successfully', async () => {
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');
      writeFileSync(file1, 'Content of file 1');
      writeFileSync(file2, 'Content of file 2');

      const result = await readMultipleFilesTool(
        { paths: [file1, file2] },
        validator,
        mockLogger
      );

      expect(result.content).toHaveLength(1);
      const text = result.content[0].text;
      expect(text).toContain('Success: 2');
      expect(text).toContain('Failures: 0');
      expect(text).toContain('Content of file 1');
      expect(text).toContain('Content of file 2');
    });

    it('should handle mixed success and failure', async () => {
      const validFile = join(testDir, 'valid.txt');
      const invalidFile = '/tmp/nonexistent-outside-allowed.txt'; // Path outside allowed dirs
      writeFileSync(validFile, 'Valid content');

      const result = await readMultipleFilesTool(
        { paths: [validFile, invalidFile] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('Success: 1');
      expect(text).toContain('Failures: 1');
      expect(text).toContain('Valid content');
      expect(text).toContain('fuera de directorios permitidos');
    });

    it('should reject paths outside allowed directories', async () => {
      const result = await readMultipleFilesTool(
        { paths: ['/etc/passwd'] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('Failures: 1');
      expect(text).toContain('fuera de directorios permitidos');
    });
  });

  describe('Size limits - Single file', () => {
    it('should truncate files exceeding 1MB limit', async () => {
      const largeFile = join(testDir, 'large.txt');
      const content = 'A'.repeat(2 * 1024 * 1024); // 2MB
      writeFileSync(largeFile, content);

      const result = await readMultipleFilesTool(
        { paths: [largeFile] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('Truncated: 1');
      expect(text).toContain('PREVIEW ONLY');
      expect(text).toContain('File exceeds 1MB limit');
      expect(text).toContain('TRUNCATION NOTICE');
      expect(text).not.toContain('A'.repeat(2 * 1024 * 1024)); // Full content not included
    });

    it('should show ~100 lines preview for large files', async () => {
      const largeFile = join(testDir, 'large.txt');
      // Create file > 1MB with many lines
      const line = 'A'.repeat(100); // 100 chars per line
      const lines = Array(15000).fill(line); // ~1.5MB
      writeFileSync(largeFile, lines.join('\n'));

      const result = await readMultipleFilesTool(
        { paths: [largeFile] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('first ~100 lines');
    });
  });

  describe('Size limits - Total 5MB cap', () => {
    it('should stop at 5MB total across all files', async () => {
      // Create 6 files of ~900KB each = ~5.4MB total
      const files: string[] = [];
      for (let i = 0; i < 6; i++) {
        const file = join(testDir, `file${i}.txt`);
        const content = 'A'.repeat(900 * 1024); // 900KB each
        writeFileSync(file, content);
        files.push(file);
      }

      const result = await readMultipleFilesTool(
        { paths: files },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      // Should read files and stop/truncate when hitting 5MB limit
      expect(text).toContain('Operation stopped early');
      expect(text).toContain('5MB total size limit');
      expect(text).toContain('Truncated:');
    }, 20000); // Increase timeout for large file operations

    it('should show partial content when file would exceed total limit', async () => {
      // Create files under individual limit but together > 5MB
      // Use smaller files for more reliable test
      const files = [
        { name: 'file1.txt', content: 'A'.repeat(900 * 1024) }, // 900KB
        { name: 'file2.txt', content: 'B'.repeat(900 * 1024) }, // 900KB
        { name: 'file3.txt', content: 'C'.repeat(900 * 1024) }, // 900KB
        { name: 'file4.txt', content: 'D'.repeat(900 * 1024) }, // 900KB
        { name: 'file5.txt', content: 'E'.repeat(900 * 1024) }, // 900KB (total 4.5MB)
        { name: 'file6.txt', content: 'F'.repeat(900 * 1024) }, // 900KB - should be partial
      ];

      const filePaths = files.map(f => {
        const path = join(testDir, f.name);
        writeFileSync(path, f.content);
        return path;
      });

      const result = await readMultipleFilesTool(
        { paths: filePaths },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('Truncated:');
      expect(text).toContain('PARTIAL');
      expect(text).toContain('Hit 5MB total limit');
    }, 15000);
  });

  describe('Validation', () => {
    it('should require at least one path', async () => {
      await expect(
        readMultipleFilesTool({ paths: [] }, validator, mockLogger)
      ).rejects.toThrow();
    });

    it('should reject more than 50 files', async () => {
      const paths = Array(51).fill(join(testDir, 'test.txt'));
      await expect(
        readMultipleFilesTool({ paths }, validator, mockLogger)
      ).rejects.toThrow();
    });

    it('should handle non-file paths (directories)', async () => {
      const subdir = join(testDir, 'subdir');
      mkdirSync(subdir);

      const result = await readMultipleFilesTool(
        { paths: [subdir] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('Failures: 1');
      expect(text).toContain('not a regular file');
    });
  });

  describe('Summary output', () => {
    it('should show byte counts in summary', async () => {
      const file1 = join(testDir, 'small.txt');
      writeFileSync(file1, 'Small content');

      const result = await readMultipleFilesTool(
        { paths: [file1] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('Total bytes read:');
      expect(text).toMatch(/\d+ bytes/); // Contains byte count
    });

    it('should indicate which files were truncated and why', async () => {
      const largeFile = join(testDir, 'large.txt');
      writeFileSync(largeFile, 'A'.repeat(2 * 1024 * 1024));

      const result = await readMultipleFilesTool(
        { paths: [largeFile] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toContain('PREVIEW ONLY');
      expect(text).toContain('File exceeds 1MB limit');
    });

    it('should provide clear separation between files', async () => {
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');
      writeFileSync(file1, 'Content 1');
      writeFileSync(file2, 'Content 2');

      const result = await readMultipleFilesTool(
        { paths: [file1, file2] },
        validator,
        mockLogger
      );

      const text = result.content[0].text;
      expect(text).toMatch(/---/g); // Contains separators
      expect(text).toContain('📄'); // File emoji markers
    });
  });
});
