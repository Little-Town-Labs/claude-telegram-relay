/**
 * Integration tests for the modular relay message flow.
 *
 * Tests the full pipeline: ClaudeService → SessionManager → MemoryService
 * with mocked child_process and filesystem.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMockSpawnNode } from "../setup";

// Mock modules before imports
vi.mock("child_process");
vi.mock("fs/promises");

describe("Relay Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("text message → ClaudeService → response", () => {
    test("full flow: buildPrompt → call → detectIntents → result", async () => {
      // Use real timers for this test since spawn mock uses setTimeout
      vi.useRealTimers();

      const { spawn } = await import("child_process");
      const { ClaudeService } = await import("../../src/services/claude");
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any;

      const config = {
        claudePath: "/usr/bin/claude",
        cliTimeoutMs: 120000,
      } as any;

      const service = new ClaudeService(config, mockLogger);

      // Build prompt with memory context
      const prompt = service.buildPrompt(
        "What's the weather?",
        "[Memory Context]\nFacts: lives in NYC"
      );

      expect(prompt).toContain("What's the weather?");
      expect(prompt).toContain("lives in NYC");

      // Mock Claude CLI response with intent markers
      vi.mocked(spawn).mockImplementation(
        (_cmd, _args?, _opts?) =>
          createMockSpawnNode("It's sunny today! [REMEMBER: user asks about weather often]") as any
      );

      const response = await service.call(prompt);
      expect(response).toContain("sunny");

      // Detect intents from response
      const { cleaned, intents, confirmations } = service.detectIntents(response);

      expect(cleaned).toContain("sunny");
      expect(cleaned).not.toContain("[REMEMBER:");
      expect(intents.remember).toBe("user asks about weather often");
      expect(confirmations).toHaveLength(1);
      expect(confirmations[0]).toContain("Remembered:");
    });
  });

  describe("SessionManager + MemoryService integration", () => {
    test("session persists across loads", async () => {
      const fs = await import("fs/promises");
      const { SessionManager } = await import("../../src/services/session");
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any;

      // First load - no file exists
      const enoent = new Error("ENOENT");
      (enoent as any).code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValueOnce(enoent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const session = new SessionManager("/tmp/session.json", 86400000, mockLogger);
      const freshState = await session.load();

      expect(freshState.sessionId).toBeNull();
      expect(freshState.messageCount).toBe(0);

      // Update activity
      await session.updateActivity("session-123");

      // Verify the saved state
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const saved = JSON.parse(writeCall[1] as string);
      expect(saved.sessionId).toBe("session-123");
      expect(saved.messageCount).toBe(1);
    });

    test("memory facts accumulate", async () => {
      const fs = await import("fs/promises");
      const { MemoryService } = await import("../../src/services/memory");
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any;

      // Start with empty memory
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const memory = new MemoryService("/tmp/memory.json", mockLogger);

      const result1 = await memory.addFact("likes coffee");
      expect(result1).toBe("Remembered: likes coffee");

      // Verify fact was saved
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const saved = JSON.parse(writeCall[1] as string);
      expect(saved.facts).toContain("likes coffee");
    });

    test("goal lifecycle: add → complete", async () => {
      const fs = await import("fs/promises");
      const { MemoryService } = await import("../../src/services/memory");
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any;

      // Start with empty memory
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const memory = new MemoryService("/tmp/memory.json", mockLogger);

      // Add goal
      const addResult = await memory.addGoal("learn TypeScript", "next month");
      expect(addResult).toBe("Goal set: learn TypeScript (deadline: next month)");

      // Mock readFile to return the saved state (with the goal)
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const savedMemory = writeCall[1] as string;
      vi.mocked(fs.readFile).mockResolvedValue(savedMemory);

      // Complete the goal
      const completeResult = await memory.completeGoal("TypeScript");
      expect(completeResult).toBe("Completed: learn TypeScript");

      // Verify goal moved to completed
      const completeWriteCall = vi.mocked(fs.writeFile).mock.calls[1]!;
      const finalMemory = JSON.parse(completeWriteCall[1] as string);
      expect(finalMemory.goals).toHaveLength(0);
      expect(finalMemory.completedGoals).toHaveLength(1);
      expect(finalMemory.completedGoals[0].text).toBe("learn TypeScript");
    });
  });

  describe("response chunking", () => {
    test("sendResponse splits long messages at natural boundaries", async () => {
      const { sendResponse } = await import("../../src/utils/telegram");

      const mockCtx = {
        reply: vi.fn().mockResolvedValue(undefined),
      } as any;

      // Create a message longer than 4000 chars
      const longMessage = "A".repeat(3000) + "\n\n" + "B".repeat(2000);
      await sendResponse(mockCtx, longMessage);

      // Should have been split into 2 chunks
      expect(mockCtx.reply).toHaveBeenCalledTimes(2);

      // First chunk should end before the double newline
      const firstCall = mockCtx.reply.mock.calls[0][0];
      expect(firstCall.length).toBeLessThanOrEqual(4000);
    });

    test("sendResponse handles short messages without splitting", async () => {
      const { sendResponse } = await import("../../src/utils/telegram");

      const mockCtx = {
        reply: vi.fn().mockResolvedValue(undefined),
      } as any;

      await sendResponse(mockCtx, "Hello, world!");
      expect(mockCtx.reply).toHaveBeenCalledTimes(1);
      expect(mockCtx.reply).toHaveBeenCalledWith("Hello, world!");
    });
  });
});
