import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Logger } from "pino";
import { SessionManager } from "../../../src/services/session";

// Mock fs/promises
vi.mock("fs/promises");

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  let mockLogger: Logger;
  const testSessionFile = "/tmp/test-session.json";
  const testTtl = 86400000; // 24h in ms

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    sessionManager = new SessionManager(testSessionFile, testTtl, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("load()", () => {
    test("returns persisted state from valid file", async () => {
      const mockState = {
        sessionId: "test-session-123",
        lastActivity: new Date("2025-01-15T12:00:00Z").toISOString(),
        messageCount: 42,
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T13:00:00Z"));

      const state = await sessionManager.load();

      expect(state).toEqual(mockState);
      expect(fs.readFile).toHaveBeenCalledWith(testSessionFile, "utf-8");

      vi.useRealTimers();
    });

    test("returns fresh state when file missing (ENOENT)", async () => {
      const fs = await import("fs/promises");
      const error = new Error("ENOENT");
      (error as any).code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      const state = await sessionManager.load();

      expect(state).toEqual({
        sessionId: null,
        lastActivity: now.toISOString(),
        messageCount: 0,
      });

      vi.useRealTimers();
    });

    test("returns fresh state when file read throws EACCES", async () => {
      const fs = await import("fs/promises");
      const error = new Error("EACCES");
      (error as any).code = "EACCES";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      const state = await sessionManager.load();

      expect(state).toEqual({
        sessionId: null,
        lastActivity: now.toISOString(),
        messageCount: 0,
      });
      expect(mockLogger.warn).toHaveBeenCalled();

      vi.useRealTimers();
    });

    test("returns fresh state when file read throws EBUSY", async () => {
      const fs = await import("fs/promises");
      const error = new Error("EBUSY");
      (error as any).code = "EBUSY";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      const state = await sessionManager.load();

      expect(state).toEqual({
        sessionId: null,
        lastActivity: now.toISOString(),
        messageCount: 0,
      });
      expect(mockLogger.warn).toHaveBeenCalled();

      vi.useRealTimers();
    });

    test("returns fresh state when file corrupted (invalid JSON)", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue("{ invalid json !");

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      const state = await sessionManager.load();

      expect(state).toEqual({
        sessionId: null,
        lastActivity: now.toISOString(),
        messageCount: 0,
      });
      expect(mockLogger.warn).toHaveBeenCalled();

      vi.useRealTimers();
    });

    test("returns fresh state when session expired", async () => {
      const lastActivity = new Date("2025-01-14T12:00:00Z");
      const mockState = {
        sessionId: "expired-session",
        lastActivity: lastActivity.toISOString(),
        messageCount: 10,
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      vi.useFakeTimers();
      // Set current time to more than TTL (24h) after lastActivity
      const now = new Date("2025-01-15T13:00:00Z"); // 25 hours later
      vi.setSystemTime(now);

      const state = await sessionManager.load();

      expect(state).toEqual({
        sessionId: null,
        lastActivity: now.toISOString(),
        messageCount: 0,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("expired")
      );

      vi.useRealTimers();
    });

    test("returns valid state when session not expired", async () => {
      const lastActivity = new Date("2025-01-15T11:00:00Z");
      const mockState = {
        sessionId: "active-session",
        lastActivity: lastActivity.toISOString(),
        messageCount: 15,
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      vi.useFakeTimers();
      // Set current time to less than TTL (24h) after lastActivity
      const now = new Date("2025-01-15T12:00:00Z"); // 1 hour later
      vi.setSystemTime(now);

      const state = await sessionManager.load();

      expect(state).toEqual(mockState);

      vi.useRealTimers();
    });

    test("returns fresh state when session exactly at expiry boundary", async () => {
      const lastActivity = new Date("2025-01-14T12:00:00Z");
      const mockState = {
        sessionId: "boundary-session",
        lastActivity: lastActivity.toISOString(),
        messageCount: 5,
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      vi.useFakeTimers();
      // Set current time to exactly TTL (24h) after lastActivity
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      const state = await sessionManager.load();

      // Exactly at boundary should not be expired (< not <=)
      expect(state).toEqual(mockState);

      vi.useRealTimers();
    });
  });

  describe("save()", () => {
    test("writes state atomically using temp file then rename", async () => {
      const state = {
        sessionId: "save-test-123",
        lastActivity: new Date("2025-01-15T12:00:00Z").toISOString(),
        messageCount: 7,
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await sessionManager.save(state);

      expect(fs.writeFile).toHaveBeenCalledWith(
        testSessionFile + ".tmp",
        JSON.stringify(state, null, 2)
      );
      expect(fs.rename).toHaveBeenCalledWith(
        testSessionFile + ".tmp",
        testSessionFile
      );
    });

    test("persists all fields correctly", async () => {
      const state = {
        sessionId: "persist-test-456",
        lastActivity: new Date("2025-01-15T14:30:00Z").toISOString(),
        messageCount: 99,
      };

      const fs = await import("fs/promises");
      let writtenData = "";
      vi.mocked(fs.writeFile).mockImplementation(async (_path, data) => {
        writtenData = data as string;
      });
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await sessionManager.save(state);

      const parsed = JSON.parse(writtenData);
      expect(parsed).toEqual(state);
      expect(parsed.sessionId).toBe("persist-test-456");
      expect(parsed.lastActivity).toBe("2025-01-15T14:30:00.000Z");
      expect(parsed.messageCount).toBe(99);
    });

    test("handles write errors gracefully", async () => {
      const state = {
        sessionId: "error-test",
        lastActivity: new Date().toISOString(),
        messageCount: 1,
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.writeFile).mockRejectedValue(new Error("Disk full"));

      await expect(sessionManager.save(state)).rejects.toThrow("Disk full");
    });

    test("handles rename errors gracefully", async () => {
      const state = {
        sessionId: "rename-error",
        lastActivity: new Date().toISOString(),
        messageCount: 2,
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockRejectedValue(new Error("Permission denied"));

      await expect(sessionManager.save(state)).rejects.toThrow(
        "Permission denied"
      );
    });
  });

  describe("updateActivity()", () => {
    test("updates sessionId field", async () => {
      const fs = await import("fs/promises");
      const initialState = {
        sessionId: null,
        lastActivity: new Date("2025-01-15T12:00:00Z").toISOString(),
        messageCount: 0,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initialState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T13:00:00Z"));

      await sessionManager.updateActivity("new-session-789");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.sessionId).toBe("new-session-789");

      vi.useRealTimers();
    });

    test("refreshes lastActivity timestamp", async () => {
      const fs = await import("fs/promises");
      const oldTime = new Date("2025-01-15T10:00:00Z");
      const initialState = {
        sessionId: "existing-session",
        lastActivity: oldTime.toISOString(),
        messageCount: 5,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initialState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      await sessionManager.updateActivity("existing-session");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.lastActivity).toBe(now.toISOString());
      expect(new Date(writtenData.lastActivity).getTime()).toBeGreaterThan(
        oldTime.getTime()
      );

      vi.useRealTimers();
    });

    test("increments messageCount by 1", async () => {
      const fs = await import("fs/promises");
      const initialState = {
        sessionId: "count-test",
        lastActivity: new Date("2025-01-15T12:00:00Z").toISOString(),
        messageCount: 10,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initialState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T13:00:00Z"));

      await sessionManager.updateActivity("count-test");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.messageCount).toBe(11);

      vi.useRealTimers();
    });

    test("updates all three fields in single operation", async () => {
      const fs = await import("fs/promises");
      const initialState = {
        sessionId: "old-session",
        lastActivity: new Date("2025-01-15T10:00:00Z").toISOString(),
        messageCount: 3,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initialState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      await sessionManager.updateActivity("updated-session");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.sessionId).toBe("updated-session");
      expect(writtenData.lastActivity).toBe(now.toISOString());
      expect(writtenData.messageCount).toBe(4);

      vi.useRealTimers();
    });
  });

  describe("clear()", () => {
    test("resets to null session state", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      await sessionManager.clear();

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.sessionId).toBeNull();
      expect(writtenData.lastActivity).toBe(now.toISOString());
      expect(writtenData.messageCount).toBe(0);

      vi.useRealTimers();
    });

    test("persists the reset state", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await sessionManager.clear();

      expect(fs.writeFile).toHaveBeenCalledWith(
        testSessionFile + ".tmp",
        expect.any(String)
      );
      expect(fs.rename).toHaveBeenCalledWith(
        testSessionFile + ".tmp",
        testSessionFile
      );
    });

    test("clears existing session data", async () => {
      const fs = await import("fs/promises");
      const existingState = {
        sessionId: "to-be-cleared",
        lastActivity: new Date("2025-01-15T10:00:00Z").toISOString(),
        messageCount: 50,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      await sessionManager.clear();

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData).not.toEqual(existingState);
      expect(writtenData.sessionId).toBeNull();
      expect(writtenData.messageCount).toBe(0);

      vi.useRealTimers();
    });
  });

  describe("edge cases", () => {
    test("handles very large messageCount values", async () => {
      const fs = await import("fs/promises");
      const initialState = {
        sessionId: "large-count",
        lastActivity: new Date().toISOString(),
        messageCount: Number.MAX_SAFE_INTEGER - 1,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initialState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await sessionManager.updateActivity("large-count");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.messageCount).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("handles sessionId with special characters", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          sessionId: null,
          lastActivity: new Date().toISOString(),
          messageCount: 0,
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const specialSessionId = "session-with-特殊字符-émojis-🚀-and-quotes\"'";
      await sessionManager.updateActivity(specialSessionId);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.sessionId).toBe(specialSessionId);
    });

    test("handles rapid consecutive updates", async () => {
      const fs = await import("fs/promises");
      const initialState = {
        sessionId: "rapid-test",
        lastActivity: new Date().toISOString(),
        messageCount: 0,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initialState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await sessionManager.updateActivity("rapid-1");
      await sessionManager.updateActivity("rapid-2");
      await sessionManager.updateActivity("rapid-3");

      expect(fs.writeFile).toHaveBeenCalledTimes(3);
      expect(fs.rename).toHaveBeenCalledTimes(3);
    });
  });
});
