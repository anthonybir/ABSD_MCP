import type { IPty } from 'node-pty';

export type SessionState = 'idle' | 'running' | 'waiting' | 'terminated';

export interface ProcessSession {
  /** Process ID */
  pid: number;

  /** PTY process instance */
  ptyProcess: IPty;

  /** Output buffer for capturing stdout/stderr */
  outputBuffer: string[];

  /** Session creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivity: Date;

  /** Shell command (e.g., 'zsh', 'python3', 'node') */
  shell: string;

  /** Current working directory */
  cwd: string;

  /** Current session state */
  state: SessionState;
}

export interface SessionInfo {
  pid: number;
  shell: string;
  cwd: string;
  state: SessionState;
  uptime: number; // milliseconds
  lastActivity: number; // milliseconds since last activity
  outputLines: number;
}
