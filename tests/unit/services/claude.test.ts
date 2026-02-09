/**
 * ClaudeService unit tests
 */

import { type SpawnOptions, spawn } from "child_process";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ClaudeService } from "../../../src/services/claude";
import type { AppConfig } from "../../../src/types/config";
import { createMockSpawnNode } from "../../setup";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("ClaudeService", () => {
  let service: ClaudeService;
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const mockConfig = {
    claudePath: "/usr/bin/claude",
    cliTimeoutMs: 120000,
    relayDir: "/tmp/test-relay",
  } as AppConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClaudeService(mockConfig, mockLogger as any);
  });

  describe("call", () => {
    test("successful call returns trimmed stdout", async () => {
      vi.mocked(spawn).mockImplementation(
        (_cmd: string, _args?: readonly string[], _opts?: SpawnOptions) =>
          createMockSpawnNode("  Hello from Claude  \n", 0) as any
      );

      const result = await service.call("test prompt");

      expect(result).toBe("Hello from Claude");
      expect(spawn).toHaveBeenCalledWith(
        "/usr/bin/claude",
        ["--print", "test prompt"],
        expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
      );
    });

    test("non-zero exit code returns error string", async () => {
      vi.mocked(spawn).mockImplementation(
        (_cmd: string, _args?: readonly string[], _opts?: SpawnOptions) =>
          createMockSpawnNode("", 1, { stderr: "Something went wrong" }) as any
      );

      const result = await service.call("test prompt");

      expect(result).toMatch(/^Error: /);
      expect(result).toContain("code 1");
    });

    test("empty prompt handling", async () => {
      vi.mocked(spawn).mockImplementation(
        (_cmd: string, _args?: readonly string[], _opts?: SpawnOptions) =>
          createMockSpawnNode("response to empty", 0) as any
      );

      const result = await service.call("");

      expect(result).toBe("response to empty");
    });

    test("passes --resume flag when resume option is true", async () => {
      vi.mocked(spawn).mockImplementation(
        (_cmd: string, _args?: readonly string[], _opts?: SpawnOptions) =>
          createMockSpawnNode("resumed", 0) as any
      );

      await service.call("test", { resume: true });

      expect(spawn).toHaveBeenCalledWith(
        "/usr/bin/claude",
        expect.arrayContaining(["--resume"]),
        expect.any(Object)
      );
    });

    test("passes --image flag when imagePath option provided", async () => {
      vi.mocked(spawn).mockImplementation(
        (_cmd: string, _args?: readonly string[], _opts?: SpawnOptions) =>
          createMockSpawnNode("image response", 0) as any
      );

      await service.call("describe this", { imagePath: "/tmp/photo.jpg" });

      expect(spawn).toHaveBeenCalledWith(
        "/usr/bin/claude",
        expect.arrayContaining(["--image", "/tmp/photo.jpg"]),
        expect.any(Object)
      );
    });
  });

  describe("buildPrompt", () => {
    test("includes system instruction text", () => {
      const prompt = service.buildPrompt("Hello");

      expect(prompt).toContain("You are a helpful AI assistant");
    });

    test("includes current timestamp in ISO format", () => {
      const prompt = service.buildPrompt("Hello");

      expect(prompt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("includes memory context when provided", () => {
      const memoryContext = "[Memory Context]\nFacts: user likes cats";
      const prompt = service.buildPrompt("Tell me about pets", memoryContext);

      expect(prompt).toContain(memoryContext);
    });

    test("handles empty message", () => {
      const prompt = service.buildPrompt("");

      expect(prompt).toContain("You are a helpful AI assistant");
      expect(prompt).toContain("User:");
    });

    test("without memory context, no memory section appears", () => {
      const prompt = service.buildPrompt("Hello");
      const promptWithContext = service.buildPrompt("Hello", "Some context");

      expect(prompt.length).toBeLessThan(promptWithContext.length);
    });

    test("includes user message in prompt", () => {
      const prompt = service.buildPrompt("What is the weather today?");

      expect(prompt).toContain("What is the weather today?");
    });
  });

  describe("detectIntents", () => {
    test("strips REMEMBER marker and returns cleaned text with intent", () => {
      const response = "Sure! [REMEMBER: User's favorite color is blue] I'll keep that in mind.";
      const result = service.detectIntents(response);

      expect(result.cleaned).not.toContain("[REMEMBER:");
      expect(result.intents.remember).toBe("User's favorite color is blue");
      expect(result.confirmations).toContain("Remembered: User's favorite color is blue");
    });

    test("strips GOAL marker without deadline", () => {
      const response = "I'll help you with that. [GOAL: Learn TypeScript]";
      const result = service.detectIntents(response);

      expect(result.cleaned).not.toContain("[GOAL:");
      expect(result.intents.goal).toEqual({ text: "Learn TypeScript" });
      expect(result.confirmations).toContain("Goal set: Learn TypeScript");
    });

    test("strips GOAL marker with deadline", () => {
      const response = "[GOAL: Complete the project | DEADLINE: tomorrow] Let's get started!";
      const result = service.detectIntents(response);

      expect(result.cleaned).toContain("Let's get started!");
      expect(result.intents.goal).toEqual({
        text: "Complete the project",
        deadline: "tomorrow",
      });
      expect(result.confirmations).toContain("Goal set: Complete the project (deadline: tomorrow)");
    });

    test("strips DONE marker and returns cleaned text with intent", () => {
      const response = "Great work! [DONE: Finished the tutorial] You're all set.";
      const result = service.detectIntents(response);

      expect(result.cleaned).not.toContain("[DONE:");
      expect(result.intents.done).toBe("Finished the tutorial");
      expect(result.confirmations).toContain("Completed: Finished the tutorial");
    });

    test("handles response with no markers", () => {
      const response = "This is just a regular response with no special markers.";
      const result = service.detectIntents(response);

      expect(result.cleaned).toBe(response);
      expect(result.intents.remember).toBeUndefined();
      expect(result.intents.goal).toBeUndefined();
      expect(result.intents.done).toBeUndefined();
      expect(result.confirmations).toEqual([]);
    });

    test("handles multiple markers in one response", () => {
      const response =
        "Okay! [REMEMBER: Meeting at 3pm] [GOAL: Prepare slides | DEADLINE: today] Got it.";
      const result = service.detectIntents(response);

      expect(result.intents.remember).toBe("Meeting at 3pm");
      expect(result.intents.goal).toEqual({
        text: "Prepare slides",
        deadline: "today",
      });
      expect(result.confirmations).toHaveLength(2);
    });

    test("handles all three marker types together", () => {
      const response = "[REMEMBER: Important note] [GOAL: Task one] [DONE: Task two] Done!";
      const result = service.detectIntents(response);

      expect(result.intents.remember).toBe("Important note");
      expect(result.intents.goal).toEqual({ text: "Task one" });
      expect(result.intents.done).toBe("Task two");
      expect(result.confirmations).toHaveLength(3);
    });

    test("handles marker with extra whitespace", () => {
      const response = "Text [REMEMBER:   lots of spaces   ] more text";
      const result = service.detectIntents(response);

      expect(result.intents.remember).toBe("lots of spaces");
    });
  });
});
