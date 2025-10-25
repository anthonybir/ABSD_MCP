import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecurityValidator } from '../../src/security/validator.js';
import { createLogger } from '../../src/utils/logger.js';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../../src/types/config.js';

// Import tools
import { readFileTool } from '../../src/tools/filesystem/read.js';
import { writeFileTool } from '../../src/tools/filesystem/write.js';
import { listDirectoryTool } from '../../src/tools/filesystem/list.js';
import { createDirectoryTool } from '../../src/tools/filesystem/create.js';
import { getFileInfoTool } from '../../src/tools/filesystem/info.js';

describe('Filesystem Tools Integration', () => {
  let validator: SecurityValidator;
  let logger: ReturnType<typeof createLogger>;
  let testDir: string;
  let config: Config;

  beforeEach(() => {
    // Create temp test directory
    testDir = join(tmpdir(), `absd-mcp-integration-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Resolve to real path (important for macOS where /tmp is symlink)
    testDir = realpathSync(testDir);

    config = {
      allowedDirectories: [testDir],
      blockedCommands: [],
      fileReadLineLimit: 1000,
      fileWriteLineLimit: 50,
      sessionTimeout: 30000,
      logLevel: 'error', // Suppress logs during tests
    };

    validator = new SecurityValidator(config);
    logger = createLogger(config);
  });

  afterEach(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('read_file and write_file integration', () => {
    it('should write and then read a file successfully', async () => {
      const testPath = join(testDir, 'test.txt');
      const testContent = 'Hello, ABSD MCP!';

      // Write file
      const writeResult = await writeFileTool(
        { path: testPath, content: testContent, mode: 'rewrite' },
        validator,
        logger,
        config
      );

      expect(writeResult.content[0].text).toContain('wrote');

      // Read file
      const readResult = await readFileTool(
        { path: testPath, offset: 0 },
        validator,
        logger,
        config
      );

      expect(readResult.content[0].text).toBe(testContent);
    });

    it('should append to existing file', async () => {
      const testPath = join(testDir, 'append-test.txt');

      // Write initial content
      await writeFileTool(
        { path: testPath, content: 'Line 1\n', mode: 'rewrite' },
        validator,
        logger,
        config
      );

      // Append content
      await writeFileTool(
        { path: testPath, content: 'Line 2\n', mode: 'append' },
        validator,
        logger,
        config
      );

      // Read full file
      const readResult = await readFileTool(
        { path: testPath, offset: 0 },
        validator,
        logger,
        config
      );

      expect(readResult.content[0].text).toBe('Line 1\nLine 2\n');
    });

    it('should handle chunked reads with offset', async () => {
      const testPath = join(testDir, 'chunked.txt');
      const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');

      await writeFileTool(
        { path: testPath, content: lines, mode: 'rewrite' },
        validator,
        logger,
        config
      );

      // Read with offset
      const readResult = await readFileTool(
        { path: testPath, offset: 5, length: 3 },
        validator,
        logger,
        config
      );

      expect(readResult.content[0].text).toContain('Line 6');
      expect(readResult.content[0].text).toContain('Line 7');
      expect(readResult.content[0].text).toContain('Line 8');
      expect(readResult.content[0].text).not.toContain('Line 9');
    });

    it('should handle negative offset (tail behavior)', async () => {
      const testPath = join(testDir, 'tail.txt');
      const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');

      await writeFileTool(
        { path: testPath, content: lines, mode: 'rewrite' },
        validator,
        logger,
        config
      );

      // Read last 3 lines
      const readResult = await readFileTool(
        { path: testPath, offset: -3 },
        validator,
        logger,
        config
      );

      expect(readResult.content[0].text).toContain('Line 8');
      expect(readResult.content[0].text).toContain('Line 9');
      expect(readResult.content[0].text).toContain('Line 10');
    });
  });

  describe('create_directory and list_directory integration', () => {
    it('should create directory and list its contents', async () => {
      const newDir = join(testDir, 'new-folder');

      // Create directory
      const createResult = await createDirectoryTool(
        { path: newDir, recursive: true },
        validator,
        logger
      );

      expect(createResult.content[0].text).toContain('created');
      expect(existsSync(newDir)).toBe(true);

      // Create some files in it
      writeFileSync(join(newDir, 'file1.txt'), 'content1');
      writeFileSync(join(newDir, 'file2.txt'), 'content2');
      mkdirSync(join(newDir, 'subfolder'));

      // List directory
      const listResult = await listDirectoryTool(
        { path: newDir, recursive: false },
        validator,
        logger
      );

      const listing = listResult.content[0].text;
      expect(listing).toContain('[FILE] file1.txt');
      expect(listing).toContain('[FILE] file2.txt');
      expect(listing).toContain('[DIR] subfolder');
    });

    it('should create nested directories recursively', async () => {
      const nestedPath = join(testDir, 'level1', 'level2', 'level3');

      const createResult = await createDirectoryTool(
        { path: nestedPath, recursive: true },
        validator,
        logger
      );

      expect(createResult.content[0].text).toContain('created');
      expect(existsSync(nestedPath)).toBe(true);
    });

    it('should list directories recursively', async () => {
      const rootDir = join(testDir, 'recursive-test');
      mkdirSync(rootDir);
      mkdirSync(join(rootDir, 'subdir1'));
      mkdirSync(join(rootDir, 'subdir2'));
      writeFileSync(join(rootDir, 'file1.txt'), 'content');
      writeFileSync(join(rootDir, 'subdir1', 'file2.txt'), 'content');

      const listResult = await listDirectoryTool(
        { path: rootDir, recursive: true, maxDepth: 2 },
        validator,
        logger
      );

      const listing = listResult.content[0].text;
      expect(listing).toContain('[FILE] file1.txt');
      expect(listing).toContain('[DIR] subdir1');
      expect(listing).toContain('[FILE] subdir1/file2.txt');
    });
  });

  describe('get_file_info integration', () => {
    it('should return file metadata', async () => {
      const testPath = join(testDir, 'info-test.txt');
      const content = 'Line 1\nLine 2\nLine 3';
      writeFileSync(testPath, content);

      const infoResult = await getFileInfoTool(
        { path: testPath },
        validator,
        logger
      );

      const info = infoResult.content[0].text;
      expect(info).toContain('Type: File');
      expect(info).toContain('Size:');
      expect(info).toContain('Created:');
      expect(info).toContain('Modified:');
      expect(info).toContain('Lines: 3');
      expect(info).toContain('Last Line (0-indexed): 2');
    });

    it('should return directory metadata', async () => {
      const dirPath = join(testDir, 'info-dir');
      mkdirSync(dirPath);

      const infoResult = await getFileInfoTool(
        { path: dirPath },
        validator,
        logger
      );

      const info = infoResult.content[0].text;
      expect(info).toContain('Type: Directory');
    });
  });

  describe('error handling', () => {
    it('should reject paths outside allowed directories', async () => {
      const outsidePath = '/etc/passwd';

      const readResult = await readFileTool(
        { path: outsidePath, offset: 0 },
        validator,
        logger,
        config
      );

      expect(readResult.content[0].text).toContain('Error');
      expect(readResult.content[0].text).toContain('fuera de directorios permitidos');
    });

    it('should handle non-existent file reads gracefully', async () => {
      const nonExistent = join(testDir, 'does-not-exist.txt');

      const readResult = await readFileTool(
        { path: nonExistent, offset: 0 },
        validator,
        logger,
        config
      );

      expect(readResult.content[0].text).toContain('Error');
      expect(readResult.content[0].text).toContain('not found');
    });

    it('should handle listing non-existent directory', async () => {
      const nonExistent = join(testDir, 'no-such-dir');

      const listResult = await listDirectoryTool(
        { path: nonExistent, recursive: false },
        validator,
        logger
      );

      expect(listResult.content[0].text).toContain('Error');
    });
  });

  describe('end-to-end workflow', () => {
    it('should support complete file operation workflow', async () => {
      const projectDir = join(testDir, 'my-project');
      const srcDir = join(projectDir, 'src');
      const indexFile = join(srcDir, 'index.ts');

      // 1. Create project structure
      await createDirectoryTool(
        { path: srcDir, recursive: true },
        validator,
        logger
      );

      // 2. Write source file
      await writeFileTool(
        {
          path: indexFile,
          content: 'export function hello() {\n  return "Hello";\n}',
          mode: 'rewrite',
        },
        validator,
        logger,
        config
      );

      // 3. Get file info
      const infoResult = await getFileInfoTool(
        { path: indexFile },
        validator,
        logger
      );
      expect(infoResult.content[0].text).toContain('Lines: 3');

      // 4. Read file back
      const readResult = await readFileTool(
        { path: indexFile, offset: 0 },
        validator,
        logger,
        config
      );
      expect(readResult.content[0].text).toContain('export function hello');

      // 5. Append to file
      await writeFileTool(
        {
          path: indexFile,
          content: '\nexport function goodbye() {\n  return "Goodbye";\n}',
          mode: 'append',
        },
        validator,
        logger,
        config
      );

      // 6. List src directory directly
      const listResult = await listDirectoryTool(
        { path: srcDir, recursive: false },
        validator,
        logger
      );
      expect(listResult.content[0].text).toContain('index.ts');
    });
  });
});
