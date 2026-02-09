/**
 * SessionManager - Conversation session persistence
 *
 * Manages session state for Claude CLI conversation continuity.
 * Supports auto-expiry and manual reset.
 */

import { readFile, rename, writeFile } from "fs/promises";
import type { Logger } from "pino";
import type { SessionState } from "../types";

export class SessionManager {
  private sessionFile: string;
  private ttlMs: number;
  private log: Logger;

  constructor(sessionFile: string, ttlMs: number, logger: Logger) {
    this.sessionFile = sessionFile;
    this.ttlMs = ttlMs;
    this.log = logger;
  }

  /**
   * Load session state from persistence file.
   * Returns fresh state if file is missing, corrupted, or expired.
   */
  async load(): Promise<SessionState> {
    try {
      const data = await readFile(this.sessionFile, "utf-8");
      const state = JSON.parse(data) as SessionState;

      // Check expiry
      const lastActivity = Date.parse(state.lastActivity);
      if (lastActivity + this.ttlMs < Date.now()) {
        this.log.info("Session expired, starting fresh");
        return this.freshState();
      }

      return state;
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      if (err?.["code"] === "ENOENT") {
        this.log.debug("No session file found, starting fresh");
      } else {
        this.log.warn({ error: err?.["message"] }, "Failed to load session");
      }
      return this.freshState();
    }
  }

  /**
   * Persist session state atomically (write temp, rename).
   */
  async save(state: SessionState): Promise<void> {
    const tmpFile = `${this.sessionFile}.tmp`;
    await writeFile(tmpFile, JSON.stringify(state, null, 2));
    await rename(tmpFile, this.sessionFile);
  }

  /**
   * Update session with new activity.
   */
  async updateActivity(): Promise<void> {
    const state = await this.load();
    state.lastActivity = new Date().toISOString();
    state.messageCount = (state.messageCount || 0) + 1;
    await this.save(state);
  }

  /**
   * Clear session — reset to fresh state.
   */
  async clear(): Promise<void> {
    await this.save(this.freshState());
    this.log.info("Session cleared");
  }

  private freshState(): SessionState {
    return {
      sessionId: null,
      lastActivity: new Date().toISOString(),
      messageCount: 0,
    };
  }
}
