import * as fs from "fs/promises";
import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureService } from "../../../src/services/capture";
import type { ClaudeService } from "../../../src/services/claude";
import type { AppConfig, SecondBrainConfig } from "../../../src/types";
import { parseFrontmatter } from "../../../src/utils/frontmatter";

vi.mock("fs/promises");
vi.mock("child_process");

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as Logger;

const secondbrainConfig: SecondBrainConfig = {
  enabled: true,
  dataDir: "/tmp/test-secondbrain",
  confidenceThreshold: 0.6,
  chatId: "123456",
  gitEnabled: false,
  gitAutoCommit: false,
  digest: {
    daily: { enabled: false, time: "07:00", timezone: "UTC", limit: 3 },
    weekly: { enabled: false, day: "sunday", time: "16:00", timezone: "UTC" },
  },
};

const mockConfig: AppConfig = {
  botToken: "test-token",
  allowedUserId: "123456",
  claudePath: "claude",
  relayDir: "/tmp/test-relay",
  tempDir: "/tmp/test-relay/temp",
  uploadsDir: "/tmp/test-relay/uploads",
  sessionFile: "/tmp/test-relay/session.json",
  lockFile: "/tmp/test-relay/relay.lock",
  memoryFile: "/tmp/test-relay/memory.json",
  sessionTtlMs: 86400000,
  cliTimeoutMs: 120000,
  nodeEnv: "test",
  logLevel: "error",
  secondbrain: secondbrainConfig,
};

function createMockClaudeService(response: string) {
  return {
    call: vi.fn().mockResolvedValue(response),
    buildPrompt: vi.fn(),
    detectIntents: vi.fn(),
  } as unknown as ClaudeService;
}

describe("CaptureService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T14:30:15.000Z"));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.appendFile).mockResolvedValue();
    vi.mocked(fs.readFile).mockRejectedValue(new Error("not found"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("classify", () => {
    it("returns classification from Claude JSON response", async () => {
      const claudeResponse = JSON.stringify({
        category: "people",
        confidence: 0.92,
        reasoning: "Mentions a person by name",
        extracted_data: {
          name: "Sarah",
          context: "Marketing campaign discussion",
          follow_ups: "Follow up next week",
        },
      });
      const claudeService = createMockClaudeService(claudeResponse);
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const result = await service.classify("Had a call with Sarah about marketing");

      expect(result.category).toBe("people");
      expect(result.confidence).toBe(0.92);
      expect(result.extracted_data).toHaveProperty("name", "Sarah");
      expect(claudeService.call).toHaveBeenCalledOnce();
    });

    it("extracts JSON from markdown code blocks", async () => {
      const claudeResponse =
        '```json\n{"category":"ideas","confidence":0.8,"reasoning":"A new concept","extracted_data":{"name":"AI Tool","one_liner":"Build an AI tool"}}\n```';
      const claudeService = createMockClaudeService(claudeResponse);
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const result = await service.classify("Build an AI tool for note taking");

      expect(result.category).toBe("ideas");
      expect(result.confidence).toBe(0.8);
    });

    it("falls back to admin/0.0 on invalid JSON", async () => {
      const claudeService = createMockClaudeService("This is not JSON at all");
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const result = await service.classify("Some random thought");

      expect(result.category).toBe("admin");
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain("parse error");
    });

    it("falls back to admin/0.0 on Claude error", async () => {
      const claudeService = createMockClaudeService("Error: Claude CLI timed out after 120000ms");
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const result = await service.classify("Some thought");

      expect(result.category).toBe("admin");
      expect(result.confidence).toBe(0);
    });

    it("falls back to admin/0.0 on invalid category in JSON", async () => {
      const claudeResponse = JSON.stringify({
        category: "unknown_category",
        confidence: 0.9,
        reasoning: "test",
        extracted_data: { name: "test" },
      });
      const claudeService = createMockClaudeService(claudeResponse);
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const result = await service.classify("Test thought");

      expect(result.category).toBe("admin");
      expect(result.confidence).toBe(0);
    });
  });

  describe("processCapture", () => {
    it("creates markdown file with frontmatter in category directory", async () => {
      const claudeService = createMockClaudeService("");
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const classification = {
        category: "people" as const,
        confidence: 0.92,
        reasoning: "Mentions Sarah",
        extracted_data: { name: "Sarah", context: "Marketing" },
      };

      const result = await service.processCapture(
        "Had a call with Sarah",
        classification,
        "123456"
      );

      expect(result.category).toBe("people");
      expect(result.confidence).toBe(0.92);
      expect(result.needsReview).toBe(false);
      expect(result.filePath).toContain("/People/");
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();

      // Verify frontmatter content
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const fileContent = writeCall?.[1] as string;
      const parsed = parseFrontmatter(fileContent);
      expect(parsed.metadata["category"]).toBe("people");
      expect(parsed.metadata["confidence"]).toBe(0.92);
    });

    it("routes low-confidence to _needs_review", async () => {
      const claudeService = createMockClaudeService("");
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const classification = {
        category: "people" as const,
        confidence: 0.4,
        reasoning: "Unclear",
        extracted_data: { name: "Unknown", context: "Vague" },
      };

      const result = await service.processCapture("Some vague thought", classification);

      expect(result.needsReview).toBe(true);
      expect(result.filePath).toContain("/_needs_review/");
    });

    it("appends to inbox log", async () => {
      const claudeService = createMockClaudeService("");
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const classification = {
        category: "projects" as const,
        confidence: 0.85,
        reasoning: "A project",
        extracted_data: { name: "Website", status: "active" as const, next_action: "Design" },
      };

      await service.processCapture("Website redesign project", classification, "123456");

      expect(fs.appendFile).toHaveBeenLastCalledWith(
        expect.stringContaining("_inbox_log.md"),
        expect.stringContaining("projects"),
        "utf-8"
      );
    });

    it("generates sanitized filename from extracted name", async () => {
      const claudeService = createMockClaudeService("");
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const classification = {
        category: "people" as const,
        confidence: 0.9,
        reasoning: "Person",
        extracted_data: { name: "Sarah O'Brien", context: "Meeting" },
      };

      const result = await service.processCapture("Met Sarah O'Brien", classification);

      expect(result.filename).toMatch(/^sarah-o-?brien-\d{8}-\d{6}\.md$/);
    });
  });

  describe("capture (convenience)", () => {
    it("classifies and processes in one call", async () => {
      const claudeResponse = JSON.stringify({
        category: "admin",
        confidence: 0.75,
        reasoning: "Administrative task",
        extracted_data: { name: "Team meeting", notes: "Quarterly review" },
      });
      const claudeService = createMockClaudeService(claudeResponse);
      const service = new CaptureService(mockConfig, claudeService, mockLogger);

      const result = await service.capture("Schedule team meeting for quarterly review", "123456");

      expect(result.category).toBe("admin");
      expect(result.confidence).toBe(0.75);
      expect(result.needsReview).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
