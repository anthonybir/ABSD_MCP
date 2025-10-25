import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageTracker, getUsageStatsTool } from '../../src/tools/meta/usage-stats.js';
import type { Logger } from '../../src/utils/logger.js';
import type { SessionManager } from '../../src/tools/terminal/session.js';
import type { SearchSessionManager } from '../../src/tools/filesystem/search-manager.js';

describe('UsageTracker', () => {
  let tracker: UsageTracker;
  let mockLogger: Logger;
  let mockSessionManager: Partial<SessionManager>;
  let mockSearchManager: Partial<SearchSessionManager>;

  beforeEach(() => {
    tracker = new UsageTracker();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockSessionManager = {
      listSessions: vi.fn().mockReturnValue([]),
    };

    mockSearchManager = {
      listSearches: vi.fn().mockReturnValue([]),
    };
  });

  describe('Tracking tool calls', () => {
    it('should track successful tool calls', () => {
      tracker.incrementToolCall('read_file');
      tracker.incrementToolCall('read_file');
      tracker.incrementToolCall('write_file');

      const stats = tracker.getStats(0, 0);

      expect(stats.toolCalls['read_file']).toBe(2);
      expect(stats.toolCalls['write_file']).toBe(1);
      expect(stats.totalCalls).toBe(3);
    });

    it('should handle multiple different tools', () => {
      tracker.incrementToolCall('read_file');
      tracker.incrementToolCall('write_file');
      tracker.incrementToolCall('list_directory');
      tracker.incrementToolCall('read_file');

      const stats = tracker.getStats(0, 0);

      expect(stats.totalCalls).toBe(4);
      expect(Object.keys(stats.toolCalls)).toHaveLength(3);
      expect(stats.toolCalls['read_file']).toBe(2);
      expect(stats.toolCalls['write_file']).toBe(1);
      expect(stats.toolCalls['list_directory']).toBe(1);
    });

    it('should not count failed calls (must explicitly call incrementToolCall)', () => {
      // Simulate 2 successful calls and 1 failed (not incremented)
      tracker.incrementToolCall('read_file');
      tracker.incrementToolCall('read_file');
      // Failed call: do NOT increment

      const stats = tracker.getStats(0, 0);

      expect(stats.toolCalls['read_file']).toBe(2);
      expect(stats.totalCalls).toBe(2);
    });
  });

  describe('Top tools ranking', () => {
    it('should return top 5 tools sorted by count', () => {
      // Create 7 tools with different counts
      tracker.incrementToolCall('tool1'); // 5 calls
      tracker.incrementToolCall('tool1');
      tracker.incrementToolCall('tool1');
      tracker.incrementToolCall('tool1');
      tracker.incrementToolCall('tool1');

      tracker.incrementToolCall('tool2'); // 4 calls
      tracker.incrementToolCall('tool2');
      tracker.incrementToolCall('tool2');
      tracker.incrementToolCall('tool2');

      tracker.incrementToolCall('tool3'); // 3 calls
      tracker.incrementToolCall('tool3');
      tracker.incrementToolCall('tool3');

      tracker.incrementToolCall('tool4'); // 2 calls
      tracker.incrementToolCall('tool4');

      tracker.incrementToolCall('tool5'); // 2 calls
      tracker.incrementToolCall('tool5');

      tracker.incrementToolCall('tool6'); // 1 call
      tracker.incrementToolCall('tool7'); // 1 call

      const stats = tracker.getStats(0, 0);

      expect(stats.topTools).toHaveLength(5); // Only top 5
      expect(stats.topTools[0]).toEqual({ name: 'tool1', count: 5 });
      expect(stats.topTools[1]).toEqual({ name: 'tool2', count: 4 });
      expect(stats.topTools[2]).toEqual({ name: 'tool3', count: 3 });
      // tool4 and tool5 both have 2 calls, order may vary
      expect(stats.topTools[3].count).toBe(2);
      expect(stats.topTools[4].count).toBe(2);
    });

    it('should handle less than 5 tools', () => {
      tracker.incrementToolCall('read_file');
      tracker.incrementToolCall('write_file');

      const stats = tracker.getStats(0, 0);

      expect(stats.topTools).toHaveLength(2);
      expect(stats.topTools[0].name).toBe('read_file');
      expect(stats.topTools[1].name).toBe('write_file');
    });

    it('should handle no tools called yet', () => {
      const stats = tracker.getStats(0, 0);

      expect(stats.topTools).toHaveLength(0);
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe('Uptime calculation', () => {
    it('should calculate uptime correctly', async () => {
      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1100));

      const stats = tracker.getStats(0, 0);

      expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(1);
      expect(stats.uptimeSeconds).toBeLessThan(2);
    });

    it('should store server start time', () => {
      const beforeStart = new Date();
      const newTracker = new UsageTracker();
      const afterStart = new Date();

      const stats = newTracker.getStats(0, 0);

      expect(stats.serverStartTime.getTime()).toBeGreaterThanOrEqual(beforeStart.getTime());
      expect(stats.serverStartTime.getTime()).toBeLessThanOrEqual(afterStart.getTime());
    });
  });

  describe('Active sessions and searches', () => {
    it('should track active sessions', () => {
      mockSessionManager.listSessions = vi.fn().mockReturnValue([
        { pid: 1 },
        { pid: 2 },
        { pid: 3 },
      ]);

      const stats = tracker.getStats(3, 0);

      expect(stats.activeSessions).toBe(3);
    });

    it('should track active searches', () => {
      mockSearchManager.listSearches = vi.fn().mockReturnValue([
        { id: 'search1' },
        { id: 'search2' },
      ]);

      const stats = tracker.getStats(0, 2);

      expect(stats.activeSearches).toBe(2);
    });

    it('should track both sessions and searches', () => {
      const stats = tracker.getStats(5, 3);

      expect(stats.activeSessions).toBe(5);
      expect(stats.activeSearches).toBe(3);
    });
  });
});

describe('get_usage_stats tool', () => {
  let tracker: UsageTracker;
  let mockLogger: Logger;
  let mockSessionManager: Partial<SessionManager>;
  let mockSearchManager: Partial<SearchSessionManager>;

  beforeEach(() => {
    tracker = new UsageTracker();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockSessionManager = {
      listSessions: vi.fn().mockReturnValue([]),
    };

    mockSearchManager = {
      listSearches: vi.fn().mockReturnValue([]),
    };
  });

  it('should return formatted usage stats', async () => {
    tracker.incrementToolCall('read_file');
    tracker.incrementToolCall('write_file');

    const result = await getUsageStatsTool(
      tracker,
      mockSessionManager as SessionManager,
      mockSearchManager as SearchSessionManager,
      mockLogger
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;

    expect(text).toContain('Server Uptime:');
    expect(text).toContain('Total calls: 2');
    expect(text).toContain('read_file: 1');
    expect(text).toContain('write_file: 1');
  });

  it('should handle no tools called yet', async () => {
    const result = await getUsageStatsTool(
      tracker,
      mockSessionManager as SessionManager,
      mockSearchManager as SearchSessionManager,
      mockLogger
    );

    const text = result.content[0].text;

    expect(text).toContain('Total calls: 0');
    expect(text).toContain('(no tools called yet)');
  });

  it('should log stats request', async () => {
    await getUsageStatsTool(
      tracker,
      mockSessionManager as SessionManager,
      mockSearchManager as SearchSessionManager,
      mockLogger
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      { tool: 'get_usage_stats' },
      'Usage stats requested'
    );
  });

  it('should include active sessions and searches in output', async () => {
    mockSessionManager.listSessions = vi.fn().mockReturnValue([{}, {}, {}]);
    mockSearchManager.listSearches = vi.fn().mockReturnValue([{}, {}]);

    const result = await getUsageStatsTool(
      tracker,
      mockSessionManager as SessionManager,
      mockSearchManager as SearchSessionManager,
      mockLogger
    );

    const text = result.content[0].text;

    expect(text).toContain('Active sessions: 3');
    expect(text).toContain('Active searches: 2');
  });
});
