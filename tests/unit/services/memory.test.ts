import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryService } from "../../../src/services/memory";

// Mock fs/promises
vi.mock("fs/promises");

describe("MemoryService", () => {
  let memoryService: MemoryService;
  let mockLogger: Logger;
  const testMemoryFile = "/tmp/test-memory.json";

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    memoryService = new MemoryService(testMemoryFile, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("load()", () => {
    test("returns persisted memory from valid file", async () => {
      const mockMemory = {
        facts: ["fact1", "fact2"],
        goals: [{ text: "goal1", createdAt: "2025-01-15T12:00:00.000Z" }],
        completedGoals: [{ text: "done1", completedAt: "2025-01-15T11:00:00.000Z" }],
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMemory));

      const memory = await memoryService.load();

      expect(memory).toEqual(mockMemory);
      expect(fs.readFile).toHaveBeenCalledWith(testMemoryFile, "utf-8");
    });

    test("returns empty memory when file missing", async () => {
      const fs = await import("fs/promises");
      const error = new Error("ENOENT");
      (error as any).code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const memory = await memoryService.load();

      expect(memory).toEqual({
        facts: [],
        goals: [],
        completedGoals: [],
      });
    });

    test("returns empty memory when file corrupted", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue("{ not valid json !!!");

      const memory = await memoryService.load();

      expect(memory).toEqual({
        facts: [],
        goals: [],
        completedGoals: [],
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("save()", () => {
    test("writes atomically using temp file then rename", async () => {
      const memory = {
        facts: ["fact1"],
        goals: [],
        completedGoals: [],
      };

      const fs = await import("fs/promises");
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await memoryService.save(memory);

      expect(fs.writeFile).toHaveBeenCalledWith(
        `${testMemoryFile}.tmp`,
        JSON.stringify(memory, null, 2)
      );
      expect(fs.rename).toHaveBeenCalledWith(`${testMemoryFile}.tmp`, testMemoryFile);
    });

    test("persists all fields correctly", async () => {
      const memory = {
        facts: ["birthday is March 15", "likes coffee"],
        goals: [
          {
            text: "learn TypeScript",
            deadline: "2025-06-01",
            createdAt: "2025-01-15T12:00:00.000Z",
          },
        ],
        completedGoals: [{ text: "finish project", completedAt: "2025-01-14T10:00:00.000Z" }],
      };

      const fs = await import("fs/promises");
      let writtenData = "";
      vi.mocked(fs.writeFile).mockImplementation(async (_path, data) => {
        writtenData = data as string;
      });
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await memoryService.save(memory);

      const parsed = JSON.parse(writtenData);
      expect(parsed).toEqual(memory);
    });
  });

  describe("addFact()", () => {
    test("appends fact and returns confirmation", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: ["existing"], goals: [], completedGoals: [] })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const result = await memoryService.addFact("birthday is March 15");

      expect(result).toBe("Remembered: birthday is March 15");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.facts).toEqual(["existing", "birthday is March 15"]);
    });

    test("drops empty strings", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );

      const result = await memoryService.addFact("");

      expect(result).toBe("");
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test("drops whitespace-only strings", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );

      const result = await memoryService.addFact("   ");

      expect(result).toBe("");
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("addGoal()", () => {
    test("appends goal with createdAt and returns confirmation", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      const result = await memoryService.addGoal("learn TypeScript");

      expect(result).toBe("Goal set: learn TypeScript");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.goals).toHaveLength(1);
      expect(writtenData.goals[0].text).toBe("learn TypeScript");
      expect(writtenData.goals[0].createdAt).toBe(now.toISOString());
      expect(writtenData.goals[0].deadline).toBeUndefined();

      vi.useRealTimers();
    });

    test("handles optional deadline", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

      const result = await memoryService.addGoal("finish project", "tomorrow");

      expect(result).toBe("Goal set: finish project (deadline: tomorrow)");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.goals[0].deadline).toBe("tomorrow");

      vi.useRealTimers();
    });

    test("drops empty strings", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );

      const result = await memoryService.addGoal("");

      expect(result).toBe("");
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("completeGoal()", () => {
    test("moves matching goal to completedGoals", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          facts: [],
          goals: [
            {
              text: "learn TypeScript",
              createdAt: "2025-01-15T12:00:00.000Z",
            },
            {
              text: "finish project",
              createdAt: "2025-01-15T13:00:00.000Z",
            },
          ],
          completedGoals: [],
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      const now = new Date("2025-01-16T10:00:00Z");
      vi.setSystemTime(now);

      const result = await memoryService.completeGoal("TypeScript");

      expect(result).toBe("Completed: learn TypeScript");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0]!;
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.goals).toHaveLength(1);
      expect(writtenData.goals[0].text).toBe("finish project");
      expect(writtenData.completedGoals).toHaveLength(1);
      expect(writtenData.completedGoals[0].text).toBe("learn TypeScript");
      expect(writtenData.completedGoals[0].completedAt).toBe(now.toISOString());

      vi.useRealTimers();
    });

    test("case-insensitive match", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          facts: [],
          goals: [
            {
              text: "Learn TypeScript",
              createdAt: "2025-01-15T12:00:00.000Z",
            },
          ],
          completedGoals: [],
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-16T10:00:00Z"));

      const result = await memoryService.completeGoal("typescript");

      expect(result).toBe("Completed: Learn TypeScript");

      vi.useRealTimers();
    });

    test("returns no match when not found", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          facts: [],
          goals: [
            {
              text: "learn TypeScript",
              createdAt: "2025-01-15T12:00:00.000Z",
            },
          ],
          completedGoals: [],
        })
      );

      const result = await memoryService.completeGoal("Python");

      expect(result).toBe("No matching goal found for: Python");
      expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
    });
  });

  describe("getContext()", () => {
    test("returns formatted context with facts and goals", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          facts: ["birthday is March 15", "likes coffee"],
          goals: [
            {
              text: "learn TypeScript",
              deadline: "2025-06-01",
              createdAt: "2025-01-15T12:00:00.000Z",
            },
            {
              text: "finish project",
              createdAt: "2025-01-15T13:00:00.000Z",
            },
          ],
          completedGoals: [],
        })
      );

      const context = await memoryService.getContext();

      expect(context).toContain("[Memory Context]");
      expect(context).toContain("birthday is March 15");
      expect(context).toContain("likes coffee");
      expect(context).toContain("learn TypeScript");
      expect(context).toContain("deadline: 2025-06-01");
      expect(context).toContain("finish project");
    });

    test("applies soft cap (50 facts, 20 goals)", async () => {
      const fs = await import("fs/promises");
      const facts = Array.from({ length: 60 }, (_, i) => `fact-${i}`);
      const goals = Array.from({ length: 25 }, (_, i) => ({
        text: `goal-${i}`,
        createdAt: "2025-01-15T12:00:00.000Z",
      }));

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts, goals, completedGoals: [] })
      );

      const context = await memoryService.getContext();

      // Should contain the most recent 50 facts (last 50)
      expect(context).toContain("fact-59");
      expect(context).toContain("fact-10");
      expect(context).not.toContain("fact-9");

      // Should contain the most recent 20 goals (last 20)
      expect(context).toContain("goal-24");
      expect(context).toContain("goal-5");
      expect(context).not.toContain("goal-4");
    });

    test("returns empty string when no data", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ facts: [], goals: [], completedGoals: [] })
      );

      const context = await memoryService.getContext();

      expect(context).toBe("");
    });

    test("formats deadlines correctly", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          facts: [],
          goals: [
            {
              text: "deadline goal",
              deadline: "tomorrow",
              createdAt: "2025-01-15T12:00:00.000Z",
            },
          ],
          completedGoals: [],
        })
      );

      const context = await memoryService.getContext();

      expect(context).toContain("deadline goal");
      expect(context).toContain("(deadline: tomorrow)");
    });

    test("returns context with only facts", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          facts: ["only fact"],
          goals: [],
          completedGoals: [],
        })
      );

      const context = await memoryService.getContext();

      expect(context).toContain("[Memory Context]");
      expect(context).toContain("only fact");
    });

    test("returns context with only goals", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          facts: [],
          goals: [
            {
              text: "only goal",
              createdAt: "2025-01-15T12:00:00.000Z",
            },
          ],
          completedGoals: [],
        })
      );

      const context = await memoryService.getContext();

      expect(context).toContain("[Memory Context]");
      expect(context).toContain("only goal");
    });
  });
});
