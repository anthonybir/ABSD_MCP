import { z } from 'zod';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult } from '../../types/config.js';
import type { SessionManager } from '../terminal/session.js';
import type { SearchSessionManager } from '../filesystem/search-manager.js';

const GetUsageStatsSchema = z.object({});

export type GetUsageStatsArgs = z.infer<typeof GetUsageStatsSchema>;

export interface UsageStats {
  serverStartTime: Date;
  uptimeSeconds: number;
  toolCalls: Record<string, number>;
  totalCalls: number;
  activeSessions: number;
  activeSearches: number;
  topTools: Array<{ name: string; count: number }>;
}

/**
 * Tracks MCP server usage statistics in-memory
 * Stats reset when server restarts (no persistence)
 */
export class UsageTracker {
  private startTime: Date;
  private callCounts: Map<string, number> = new Map();

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Increment tool call count (only call after successful execution)
   */
  incrementToolCall(toolName: string): void {
    const current = this.callCounts.get(toolName) || 0;
    this.callCounts.set(toolName, current + 1);
  }

  /**
   * Get current usage statistics
   */
  getStats(activeSessions: number, activeSearches: number): UsageStats {
    const now = new Date();
    const uptimeSeconds = Math.floor((now.getTime() - this.startTime.getTime()) / 1000);

    const toolCalls: Record<string, number> = {};
    let totalCalls = 0;

    this.callCounts.forEach((count, tool) => {
      toolCalls[tool] = count;
      totalCalls += count;
    });

    const topTools = Array.from(this.callCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      serverStartTime: this.startTime,
      uptimeSeconds,
      toolCalls,
      totalCalls,
      activeSessions,
      activeSearches,
      topTools,
    };
  }
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export async function getUsageStatsTool(
  tracker: UsageTracker,
  sessionManager: SessionManager,
  searchManager: SearchSessionManager,
  logger: Logger
): Promise<ToolResult> {
  const activeSessions = sessionManager.listSessions().length;
  const activeSearches = searchManager.listSearches().length;
  const stats = tracker.getStats(activeSessions, activeSearches);

  logger.info({ tool: 'get_usage_stats' }, 'Usage stats requested');

  const uptime = formatUptime(stats.uptimeSeconds);
  const topToolsStr = stats.topTools.length > 0
    ? stats.topTools.map(t => `  ${t.name}: ${t.count} calls`).join('\n')
    : '  (no tools called yet)';

  const allToolsStr = Object.keys(stats.toolCalls).length > 0
    ? Object.entries(stats.toolCalls)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `  ${name}: ${count}`)
        .join('\n')
    : '  (no tools called yet)';

  return {
    content: [{
      type: 'text',
      text: `Server Uptime: ${uptime}
Started: ${stats.serverStartTime.toISOString()}

Tool Usage:
Total calls: ${stats.totalCalls}
Active sessions: ${stats.activeSessions}
Active searches: ${stats.activeSearches}

Top 5 Tools:
${topToolsStr}

All Tools:
${allToolsStr}`,
    }],
  };
}

export const getUsageStatsToolDefinition = {
  name: 'get_usage_stats',
  description: 'Get server usage statistics including uptime, tool call counts (successful calls only), and active sessions/searches. Stats reset when server restarts.',
  inputSchema: GetUsageStatsSchema,
};
