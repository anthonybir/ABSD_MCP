import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchSessionManager } from '../../src/tools/filesystem/search-manager.js';
import {
  startSearchTool,
  getMoreSearchResultsTool,
  stopSearchTool,
  listSearchesTool,
} from '../../src/tools/filesystem/search-streaming.js';
import { SecurityValidator } from '../../src/security/validator.js';
import type { Config } from '../../src/types/config.js';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

// Mock child process
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  constructor(private args: string[]) {
    super();
    // Handle --version check immediately for ripgrep availability
    if (args.includes('--version')) {
      process.nextTick(() => {
        this.emit('exit', 0);
      });
    }
  }

  kill() {
    this.killed = true;
    this.emit('exit', 0);
  }
}

// Mock spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn((cmd: string, args: string[]) => new MockChildProcess(args)),
}));

describe('search_streaming tools', () => {
  let testDir: string;
  let validator: SecurityValidator;
  let mockLogger: any;
  let config: Config;
  let searchManager: SearchSessionManager;

  beforeEach(() => {
    // Create temp test directory
    testDir = join(tmpdir(), `absd-mcp-search-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test files
    writeFileSync(join(testDir, 'test1.txt'), 'Hello World\nFoo Bar\n');
    writeFileSync(join(testDir, 'test2.txt'), 'Another file\nWith content\n');
    writeFileSync(join(testDir, 'test.js'), 'console.log("test");\n');

    // Mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    config = {
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
    searchManager = new SearchSessionManager(mockLogger);
  });

  afterEach(() => {
    // Cleanup
    searchManager.dispose();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('start_search', () => {
    it('should start a file search and return session ID', async () => {
      const result = await startSearchTool(
        {
          path: testDir,
          pattern: 'test',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Search started:');
      expect(result.content[0].text).toMatch(/[0-9a-f-]{36}/); // UUID pattern
    });

    it('should start a content search', async () => {
      const result = await startSearchTool(
        {
          path: testDir,
          pattern: 'Hello',
          searchType: 'content',
        },
        validator,
        mockLogger,
        searchManager
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Search started:');
    });

    it('should validate path before starting search', async () => {
      const result = await startSearchTool(
        {
          path: '/invalid/path/../../../etc/passwd',
          pattern: 'test',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
    });

    it('should apply default values', async () => {
      const result = await startSearchTool(
        {
          path: testDir,
          pattern: 'test',
          // searchType defaults to 'files'
          // ignoreCase defaults to true
        },
        validator,
        mockLogger,
        searchManager
      );

      expect(result.content[0].text).toContain('Search started:');
    });
  });

  describe('get_more_search_results', () => {
    it('should retrieve search results', async () => {
      // Start a search first
      const startResult = await startSearchTool(
        {
          path: testDir,
          pattern: 'test',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      const sessionId = startResult.content[0].text.match(/([0-9a-f-]{36})/)?.[1];
      expect(sessionId).toBeDefined();

      // Get results
      const result = await getMoreSearchResultsTool(
        {
          sessionId: sessionId!,
          offset: 0,
          length: 10,
        },
        mockLogger,
        searchManager
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Search Results');
      expect(result.content[0].text).toContain('Status:');
    });

    it('should handle invalid session ID', async () => {
      const result = await getMoreSearchResultsTool(
        {
          sessionId: 'invalid-session-id',
          offset: 0,
          length: 10,
        },
        mockLogger,
        searchManager
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
    });

    it('should support negative offset (tail behavior)', async () => {
      const startResult = await startSearchTool(
        {
          path: testDir,
          pattern: 'test',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      const sessionId = startResult.content[0].text.match(/([0-9a-f-]{36})/)?.[1]!;

      const result = await getMoreSearchResultsTool(
        {
          sessionId,
          offset: -5,
          length: 10,
        },
        mockLogger,
        searchManager
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Search Results');
    });
  });

  describe('stop_search', () => {
    it('should stop a running search', async () => {
      const startResult = await startSearchTool(
        {
          path: testDir,
          pattern: 'test',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      const sessionId = startResult.content[0].text.match(/([0-9a-f-]{36})/)?.[1]!;

      const result = await stopSearchTool(
        {
          sessionId,
        },
        mockLogger,
        searchManager
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('stopped');
    });

    it('should handle invalid session ID', async () => {
      const result = await stopSearchTool(
        {
          sessionId: 'invalid-id',
        },
        mockLogger,
        searchManager
      );

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error');
    });
  });

  describe('list_searches', () => {
    it('should list all active searches', async () => {
      // Start multiple searches
      await startSearchTool(
        {
          path: testDir,
          pattern: 'test1',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      await startSearchTool(
        {
          path: testDir,
          pattern: 'test2',
          searchType: 'content',
        },
        validator,
        mockLogger,
        searchManager
      );

      const result = await listSearchesTool(mockLogger, searchManager);

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Active Search Sessions');
      expect(result.content[0].text).toContain('test1');
      expect(result.content[0].text).toContain('test2');
    });

    it('should handle no active searches', async () => {
      const result = await listSearchesTool(mockLogger, searchManager);

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('No active search sessions');
    });
  });

  describe('SearchSessionManager', () => {
    it('should enforce max concurrent sessions', async () => {
      const maxSessions = 5; // Per plan: keep resource usage predictable

      // Start max sessions
      const promises: Promise<any>[] = [];
      for (let i = 0; i < maxSessions; i++) {
        promises.push(
          startSearchTool(
            {
              path: testDir,
              pattern: `test${i}`,
              searchType: 'files',
            },
            validator,
            mockLogger,
            searchManager
          )
        );
      }

      await Promise.all(promises);

      // Try to start one more
      const result = await startSearchTool(
        {
          path: testDir,
          pattern: 'overflow',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('Maximum concurrent searches');
    });

    it('should clean up on dispose', async () => {
      const startResult = await startSearchTool(
        {
          path: testDir,
          pattern: 'test',
          searchType: 'files',
        },
        validator,
        mockLogger,
        searchManager
      );

      const sessionId = startResult.content[0].text.match(/([0-9a-f-]{36})/)?.[1]!;

      // Dispose should kill all sessions
      searchManager.dispose();

      // Trying to get results should fail
      const result = await getMoreSearchResultsTool(
        {
          sessionId,
          offset: 0,
          length: 10,
        },
        mockLogger,
        searchManager
      );

      expect(result.content[0].text).toContain('Error');
    });

    it('should clear cleanup timer on dispose', () => {
      // Access private cleanupInterval via type casting
      const manager = searchManager as any;

      // Verify timer exists before dispose
      expect(manager.cleanupInterval).toBeDefined();

      // Dispose should clear the timer
      searchManager.dispose();

      // Verify timer is cleared
      expect(manager.cleanupInterval).toBeUndefined();
    });
  });
});
