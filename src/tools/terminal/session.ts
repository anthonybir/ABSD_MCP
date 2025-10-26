import { spawn as spawnPty } from 'node-pty';
import type { IPty } from 'node-pty';
import type { ProcessSession, SessionInfo, SessionState } from '../../types/session.js';
import type { Logger } from '../../utils/logger.js';

export class SessionManager {
  private sessions: Map<number, ProcessSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private logger: Logger,
    private sessionTimeout: number = 30 * 60 * 1000 // 30 minutes default
  ) {
    // Start cleanup interval (every 5 minutes)
    this.startCleanupInterval();
  }

  /**
   * Create a new terminal session
   */
  create(
    command: string = process.env.SHELL || 'zsh',
    args: string[] = [],
    cwd: string = process.env.HOME || process.cwd()
  ): ProcessSession {
    try {
      const ptyProcess = spawnPty(command, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: process.env as Record<string, string>,
      });

      const session: ProcessSession = {
        pid: ptyProcess.pid,
        ptyProcess,
        outputBuffer: [],
        createdAt: new Date(),
        lastActivity: new Date(),
        shell: command,
        cwd,
        state: 'idle',
      };

      // Capture output
      ptyProcess.onData((data) => {
        session.outputBuffer.push(data);
        session.lastActivity = new Date();
        session.state = 'running';
      });

      // Handle process exit
      ptyProcess.onExit(({ exitCode }) => {
        this.logger.info({
          pid: session.pid,
          exitCode,
        }, 'Process exited');
        session.state = 'terminated';
      });

      this.sessions.set(ptyProcess.pid, session);

      this.logger.info({
        pid: ptyProcess.pid,
        shell: command,
        cwd,
      }, 'Session created');

      return session;
    } catch (error) {
      this.logger.error({ error, command, cwd }, 'Failed to create session');
      throw error;
    }
  }

  /**
   * Get a session by PID
   */
  get(pid: number): ProcessSession | undefined {
    return this.sessions.get(pid);
  }

  /**
   * Alias used by tooling layers that expect listSessions()
   */
  listSessions(): SessionInfo[] {
    return this.listAll();
  }

  /**
   * Get all active sessions
   */
  listAll(): SessionInfo[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).map(session => ({
      pid: session.pid,
      shell: session.shell,
      cwd: session.cwd,
      state: session.state,
      uptime: now - session.createdAt.getTime(),
      lastActivity: now - session.lastActivity.getTime(),
      outputLines: session.outputBuffer.length,
    }));
  }

  /**
   * Terminate a session by PID
   */
  terminate(pid: number): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      return false;
    }

    try {
      session.ptyProcess.kill();
      session.state = 'terminated';
      this.sessions.delete(pid);

      this.logger.info({ pid }, 'Session terminated');
      return true;
    } catch (error) {
      this.logger.error({ error, pid }, 'Failed to terminate session');
      return false;
    }
  }

  /**
   * Clean up stale sessions (inactive beyond timeout)
   */
  cleanupStale(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [pid, session] of this.sessions) {
      const idle = now - session.lastActivity.getTime();

      if (idle > this.sessionTimeout || session.state === 'terminated') {
        this.terminate(pid);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info({ cleaned }, 'Cleaned up stale sessions');
    }

    return cleaned;
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStale();
    }, 5 * 60 * 1000);

    // Don't prevent process from exiting
    this.cleanupInterval.unref();
  }

  /**
   * Stop cleanup interval and terminate all sessions
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Terminate all sessions
    for (const pid of this.sessions.keys()) {
      this.terminate(pid);
    }

    this.logger.info('SessionManager shut down');
  }

  /**
   * Get session count
   */
  get count(): number {
    return this.sessions.size;
  }
}
