/**
 * Lock manager tests
 */

import { join } from "path";
import { readFile, unlink, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createLockManager } from "../../../src/utils/lock";

const TEST_LOCK_FILE = join(process.cwd(), "tests", ".test-lock");

describe("LockManager", () => {
  let lockManager: ReturnType<typeof createLockManager>;

  beforeEach(async () => {
    // Clean up any existing test lock
    await unlink(TEST_LOCK_FILE).catch(() => {});
    lockManager = createLockManager(TEST_LOCK_FILE);
  });

  afterEach(async () => {
    await unlink(TEST_LOCK_FILE).catch(() => {});
  });

  test("acquires lock when no lock exists", async () => {
    const acquired = await lockManager.acquire();

    expect(acquired).toBe(true);

    // Verify lock file contains PID
    const content = await readFile(TEST_LOCK_FILE, "utf-8");
    expect(content).toBe(process.pid.toString());
  });

  test("fails to acquire lock when another process holds it", async () => {
    // Write a lock file with current PID (simulating another instance)
    await writeFile(TEST_LOCK_FILE, process.pid.toString());

    const acquired = await lockManager.acquire();

    expect(acquired).toBe(false);
  });

  test("acquires lock when lock file has stale PID", async () => {
    // Write a lock file with a non-existent PID
    await writeFile(TEST_LOCK_FILE, "999999999");

    const acquired = await lockManager.acquire();

    expect(acquired).toBe(true);
  });

  test("releases lock", async () => {
    await lockManager.acquire();
    await lockManager.release();

    // Lock file should be removed
    const exists = await readFile(TEST_LOCK_FILE, "utf-8").catch(() => null);
    expect(exists).toBeNull();
  });

  test("isLocked returns true when lock is held", async () => {
    await writeFile(TEST_LOCK_FILE, process.pid.toString());

    const locked = await lockManager.isLocked();

    expect(locked).toBe(true);
  });

  test("isLocked returns false when no lock exists", async () => {
    const locked = await lockManager.isLocked();

    expect(locked).toBe(false);
  });
});
