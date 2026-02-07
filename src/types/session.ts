/**
 * Session types for conversation continuity
 */

export interface SessionState {
  /** Claude CLI session ID for --resume */
  sessionId: string | null;

  /** ISO timestamp of last activity */
  lastActivity: string;

  /** Number of messages in this session */
  messageCount: number;
}

export interface SessionManager {
  /** Load session state from persistence */
  load(): Promise<SessionState>;

  /** Save session state to persistence */
  save(state: SessionState): Promise<void>;

  /** Update session with new activity */
  updateActivity(sessionId: string): Promise<void>;

  /** Clear session state */
  clear(): Promise<void>;
}
