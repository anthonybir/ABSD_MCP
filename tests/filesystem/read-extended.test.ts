import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { readFileTool } from '../../src/tools/filesystem/read.js';
import { SecurityValidator } from '../../src/security/validator.js';
import type { Config } from '../../src/types/config.js';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import nock from 'nock';

describe('read_file extended functionality', () => {
  let testDir: string;
  let validator: SecurityValidator;
  let mockLogger: any;
  let config: Config;

  beforeAll(() => {
    // Ensure nock is enabled
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  afterAll(() => {
    nock.restore();
  });

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

    config = {
      allowedDirectories: [testDir],
      blockedCommands: [],
      fileReadLineLimit: 1000,
      fileWriteLineLimit: 50,
      sessionTimeout: 30000,
      logLevel: 'error',
      urlDenylist: ['localhost', '127.0.0.1', '0.0.0.0', '::1'],
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
    nock.cleanAll();
  });

  describe('Image file support', () => {
    it('should return ImageContent for PNG files', async () => {
      const imagePath = join(testDir, 'test.png');
      const fixtureImage = readFileSync(join(process.cwd(), 'tests/fixtures/test-image.png'));
      writeFileSync(imagePath, fixtureImage);

      const result = await readFileTool(
        { path: imagePath, offset: 0 },
        validator,
        mockLogger,
        config
      );

      expect(result.content).toHaveLength(1);

      // Debug: log the actual result if it's not an image
      if (result.content[0].type !== 'image') {
        console.log('Expected image but got:', result.content[0]);
      }

      expect(result.content[0].type).toBe('image');
      if (result.content[0].type === 'image') {
        expect(result.content[0].mimeType).toBe('image/png');
        expect(result.content[0].data).toBeDefined();
        expect(result.content[0].data.length).toBeGreaterThan(0);

        // Verify it's base64
        expect(() => Buffer.from(result.content[0].data, 'base64')).not.toThrow();
      }
    });

    it('should support multiple image formats', async () => {
      const formats = [
        { ext: 'jpg', mime: 'image/jpeg' },
        { ext: 'jpeg', mime: 'image/jpeg' },
        { ext: 'gif', mime: 'image/gif' },
        { ext: 'webp', mime: 'image/webp' },
        { ext: 'bmp', mime: 'image/bmp' },
      ];

      for (const format of formats) {
        const imagePath = join(testDir, `test.${format.ext}`);
        const fixtureImage = readFileSync(join(process.cwd(), 'tests/fixtures/test-image.png'));
        writeFileSync(imagePath, fixtureImage);

        const result = await readFileTool(
          { path: imagePath, offset: 0 },
          validator,
          mockLogger,
          config
        );

        expect(result.content[0].type).toBe('image');
        if (result.content[0].type === 'image') {
          expect(result.content[0].mimeType).toBe(format.mime);
        }
      }
    });

    it('should reject images larger than 10MB', async () => {
      const imagePath = join(testDir, 'large.png');
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      writeFileSync(imagePath, largeBuffer);

      const result = await readFileTool(
        { path: imagePath, offset: 0 },
        validator,
        mockLogger,
        config
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('10MB');
    });

    it('should treat SVG files as text (security)', async () => {
      const svgPath = join(testDir, 'test.svg');
      const svgContent = '<svg><script>alert("XSS")</script><circle/></svg>';
      writeFileSync(svgPath, svgContent);

      const result = await readFileTool(
        { path: svgPath, offset: 0 },
        validator,
        mockLogger,
        config
      );

      // SVG should be returned as text, not image
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('<svg>');
      expect(result.content[0].text).toContain('<script>');
    });
  });

  describe('URL fetching', () => {
    it('should fetch text content from URL', async () => {
      const url = 'https://example.com/test.txt';
      nock('https://example.com')
        .get('/test.txt')
        .reply(200, 'Line 1\nLine 2\nLine 3', {
          'content-type': 'text/plain',
        });

      const result = await readFileTool(
        { path: url, offset: 0, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Line 1');
      expect(result.content[0].text).toContain('Line 2');
    });

    it('should fetch image from URL', async () => {
      const url = 'https://example.com/image.png';
      const fixtureImage = readFileSync(join(process.cwd(), 'tests/fixtures/test-image.png'));

      nock('https://example.com')
        .get('/image.png')
        .reply(200, fixtureImage, {
          'content-type': 'image/png',
        });

      const result = await readFileTool(
        { path: url, offset: 0, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('image');
      if (result.content[0].type === 'image') {
        expect(result.content[0].mimeType).toBe('image/png');
        expect(result.content[0].data).toBeDefined();
      }
    });

    it('should block localhost URLs', async () => {
      const result = await readFileTool(
        { path: 'http://localhost:3000/test.txt', offset: 0, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('denylist');
    });

    it('should block 127.0.0.1 URLs', async () => {
      const result = await readFileTool(
        { path: 'http://127.0.0.1:3000/test.txt', offset: 0, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('denylist');
    });

    it('should reject URLs exceeding 5MB', async () => {
      const url = 'https://example.com/large.bin';
      nock('https://example.com')
        .get('/large.bin')
        .reply(200, 'x', {
          'content-length': '6000000', // 6MB
        });

      const result = await readFileTool(
        { path: url, offset: 0, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('5MB');
    });

    it('should handle HTTP errors', async () => {
      const url = 'https://example.com/notfound.txt';
      nock('https://example.com')
        .get('/notfound.txt')
        .reply(404);

      const result = await readFileTool(
        { path: url, offset: 0, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('404');
    });

    it('should apply line limits to URL text content', async () => {
      const url = 'https://example.com/long.txt';
      const lines = Array(100).fill('test line').join('\n');

      nock('https://example.com')
        .get('/long.txt')
        .reply(200, lines);

      const result = await readFileTool(
        { path: url, offset: 0, length: 10, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content[0].type).toBe('text');
      const returnedLines = result.content[0].text.split('\n');
      expect(returnedLines.length).toBeLessThanOrEqual(10);
    });

    it('should support negative offset for URL content', async () => {
      const url = 'https://example.com/test.txt';
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';

      nock('https://example.com')
        .get('/test.txt')
        .reply(200, content);

      const result = await readFileTool(
        { path: url, offset: -2, isUrl: true },
        validator,
        mockLogger,
        config
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Line 4');
      expect(result.content[0].text).toContain('Line 5');
    });
  });

  describe('Timeout handling', () => {
    it('should timeout on slow requests', async () => {
      const url = 'https://example.com/slow.txt';

      // Create a slow response that takes longer than timeout
      nock('https://example.com')
        .get('/slow.txt')
        .delay(15000) // 15 seconds delay
        .reply(200, 'slow content');

      // Use shorter timeout for test
      const fastConfig = { ...config, urlTimeout: 100 };

      const result = await readFileTool(
        { path: url, offset: 0, isUrl: true },
        validator,
        mockLogger,
        fastConfig
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
    });
  });
});
