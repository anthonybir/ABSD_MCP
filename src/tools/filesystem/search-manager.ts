import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';

export interface SearchResult {
  path: string;
  lineNumber?: number;
  matchedText?: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

export interface SearchSession {
  id: string;
  pattern: string;
  searchPath: string;
  searchType: 'files' | 'content';
  status: 'running' | 'completed' | 'stopped' | 'error';
  results: SearchResult[];
  error?: string;
  startTime: number;
  endTime?: number;
  process?: ChildProcess;
}

interface SearchOptions {
  pattern: string;
  searchPath: string;
  searchType: 'files' | 'content';
  filePattern?: string;
  ignoreCase?: boolean;
  literalSearch?: boolean;
  contextLines?: number;
  maxResults?: number;
  timeout?: number;
}

export class SearchSessionManager {
  private sessions = new Map<string, SearchSession>();
  private readonly MAX_SESSIONS = 5; // Keep resource usage predictable
  private readonly SESSION_TTL = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval?: NodeJS.Timeout;
  private ripgrepAvailable: boolean | null = null; // Cached ripgrep availability

  constructor(private logger: Logger) {
    this.startCleanupTimer();
  }

  /**
   * Check if ripgrep is available (cached after first check)
   */
  private async checkRipgrepAvailable(): Promise<boolean> {
    if (this.ripgrepAvailable !== null) {
      return this.ripgrepAvailable;
    }

    try {
      const proc = spawn('rg', ['--version'], { stdio: 'ignore' });
      const exitCode = await new Promise<number>((resolve) => {
        proc.on('exit', (code) => resolve(code ?? 1));
        proc.on('error', () => resolve(1));
      });
      this.ripgrepAvailable = exitCode === 0;
      this.logger.info({ available: this.ripgrepAvailable }, 'Ripgrep availability checked');
      return this.ripgrepAvailable;
    } catch {
      this.ripgrepAvailable = false;
      return false;
    }
  }

  /**
   * Start a new search session
   */
  async startSearch(options: SearchOptions): Promise<string> {
    // Check ripgrep availability
    const isAvailable = await this.checkRipgrepAvailable();
    if (!isAvailable) {
      throw new Error('ripgrep (rg) is not available. Please install ripgrep to use search functionality.');
    }

    // Check session limit
    if (this.sessions.size >= this.MAX_SESSIONS) {
      throw new Error(`Maximum concurrent searches (${this.MAX_SESSIONS}) reached`);
    }

    const sessionId = randomUUID();
    const session: SearchSession = {
      id: sessionId,
      pattern: options.pattern,
      searchPath: options.searchPath,
      searchType: options.searchType,
      status: 'running',
      results: [],
      startTime: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.logger.info({ sessionId, options }, 'Starting search session');

    // Start background search
    this.executeSearch(sessionId, options).catch((error) => {
      const sess = this.sessions.get(sessionId);
      if (sess) {
        sess.status = 'error';
        sess.error = error instanceof Error ? error.message : String(error);
        sess.endTime = Date.now();
        this.logger.error({ sessionId, error: sess.error }, 'Search failed');
      }
    });

    return sessionId;
  }

  /**
   * Get search results with pagination
   */
  getResults(sessionId: string, offset = 0, length = 100): {
    results: SearchResult[];
    total: number;
    status: string;
    hasMore: boolean;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Search session not found: ${sessionId}`);
    }

    // Handle negative offset (tail behavior)
    const actualOffset = offset < 0
      ? Math.max(0, session.results.length + offset)
      : Math.min(offset, session.results.length);

    const end = offset < 0
      ? session.results.length
      : Math.min(actualOffset + length, session.results.length);

    const results = session.results.slice(actualOffset, end);
    const hasMore = session.status === 'running' || end < session.results.length;

    return {
      results,
      total: session.results.length,
      status: session.status,
      hasMore,
    };
  }

  /**
   * Stop a running search
   */
  stopSearch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Search session not found: ${sessionId}`);
    }

    if (session.status === 'running' && session.process) {
      session.process.kill();
      session.status = 'stopped';
      session.endTime = Date.now();
      this.logger.info({ sessionId }, 'Search stopped');
    }
  }

  /**
   * List all active searches
   */
  listSearches(): Array<{
    id: string;
    pattern: string;
    searchType: string;
    status: string;
    resultCount: number;
    runtime: number;
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      pattern: session.pattern,
      searchType: session.searchType,
      status: session.status,
      resultCount: session.results.length,
      runtime: (session.endTime || Date.now()) - session.startTime,
    }));
  }

  /**
   * Execute ripgrep search in background
   */
  private async executeSearch(sessionId: string, options: SearchOptions): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const args: string[] = [];

    // Search type
    if (options.searchType === 'files') {
      args.push('--files');
    } else {
      // Content search
      args.push('--line-number');
      if (options.contextLines && options.contextLines > 0) {
        args.push('--context', String(options.contextLines));
      }
    }

    // Case sensitivity
    if (options.ignoreCase) {
      args.push('--ignore-case');
    }

    // Literal vs regex
    if (options.literalSearch) {
      args.push('--fixed-strings');
    }

    // File pattern filter
    if (options.filePattern) {
      args.push('--glob', options.filePattern);
    }

    // Add pattern (only for content search)
    if (options.searchType === 'content') {
      args.push(options.pattern);
    } else {
      // For file search, pattern is used as glob filter
      args.push('--glob', `*${options.pattern}*`);
    }

    // Add search path
    args.push(options.searchPath);

    this.logger.debug({ sessionId, args }, 'Spawning ripgrep');

    // Spawn ripgrep
    const proc = spawn('rg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    session.process = proc;

    let buffer = '';
    let resultCount = 0;

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        // Check max results
        if (options.maxResults && resultCount >= options.maxResults) {
          proc.kill();
          session.status = 'completed';
          session.endTime = Date.now();
          this.logger.info({ sessionId, resultCount }, 'Max results reached');
          return;
        }

        const result = this.parseLine(line, options.searchType);
        if (result) {
          session.results.push(result);
          resultCount++;
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const error = chunk.toString('utf-8');
      this.logger.warn({ sessionId, error }, 'Search stderr');
    });

    proc.on('exit', (code) => {
      if (session.status === 'running') {
        session.status = code === 0 ? 'completed' : 'error';
        session.endTime = Date.now();
        if (code !== 0) {
          session.error = `ripgrep exited with code ${code}`;
        }
        this.logger.info({ sessionId, code, resultCount: session.results.length }, 'Search completed');
      }
    });

    // Timeout
    if (options.timeout) {
      setTimeout(() => {
        if (session.status === 'running') {
          proc.kill();
          session.status = 'completed';
          session.endTime = Date.now();
          this.logger.info({ sessionId }, 'Search timeout');
        }
      }, options.timeout);
    }
  }

  /**
   * Parse ripgrep output line
   */
  private parseLine(line: string, searchType: 'files' | 'content'): SearchResult | null {
    if (searchType === 'files') {
      // File search: just the path
      return { path: line.trim() };
    }

    // Content search: path:line:text
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    if (!match) return null;

    return {
      path: match[1],
      lineNumber: parseInt(match[2], 10),
      matchedText: match[3],
    };
  }

  /**
   * Cleanup old sessions (called periodically)
   */
  private cleanup(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      const age = now - session.startTime;
      const isExpired = age > this.SESSION_TTL;
      const isFinished = session.status !== 'running';

      if (isExpired && isFinished) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.sessions.delete(id);
      this.logger.debug({ sessionId: id }, 'Session cleaned up');
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute

    // Don't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.logger.info('Disposing SearchSessionManager');

    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Stop all running searches
    for (const session of this.sessions.values()) {
      if (session.status === 'running' && session.process) {
        session.process.kill();
      }
    }

    // Clear sessions
    this.sessions.clear();
  }
}
