/**
 * Lock file management for single-instance enforcement
 * Extracted from relay.ts:61-101
 */

import { unlinkSync } from "fs";
import { readFile, unlink, writeFile } from "fs/promises";
import { createLogger } from "./logger";

const log = createLogger("lock");

export interface LockManager {
  /** Attempt to acquire the lock */
  acquire(): Promise<boolean>;

  /** Release the lock */
  release(): Promise<void>;

  /** Check if lock is held by another process */
  isLocked(): Promise<boolean>;
}

/**
 * Create a lock manager for a given lock file path
 */
export function createLockManager(lockFile: string): LockManager {
  return {
    async acquire(): Promise<boolean> {
      try {
        const existingLock = await readFile(lockFile, "utf-8").catch(() => null);

        if (existingLock) {
          const pid = Number.parseInt(existingLock, 10);

          // Check if process exists
          try {
            process.kill(pid, 0);
            log.warn({ pid }, "Another instance is running");
            return false;
          } catch {
            log.info("Stale lock found, taking over");
          }
        }

        await writeFile(lockFile, process.pid.toString());
        log.debug({ pid: process.pid, lockFile }, "Lock acquired");
        return true;
      } catch (error) {
        log.error({ error }, "Failed to acquire lock");
        return false;
      }
    },

    async release(): Promise<void> {
      try {
        await unlink(lockFile);
        log.debug({ lockFile }, "Lock released");
      } catch {
        // Ignore if lock file doesn't exist
      }
    },

    async isLocked(): Promise<boolean> {
      try {
        const existingLock = await readFile(lockFile, "utf-8");
        const pid = Number.parseInt(existingLock, 10);

        // Check if process exists
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Set up process exit handlers to release lock
 */
export function setupLockCleanup(lockFile: string): void {
  const cleanup = () => {
    try {
      unlinkSync(lockFile);
    } catch {
      // Ignore errors on cleanup
    }
  };

  process.on("exit", cleanup);

  process.on("SIGINT", async () => {
    await createLockManager(lockFile).release();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await createLockManager(lockFile).release();
    process.exit(0);
  });
}
