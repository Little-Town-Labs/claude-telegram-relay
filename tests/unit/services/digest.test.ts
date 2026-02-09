import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeService } from "../../../src/services/claude";
import { DigestService } from "../../../src/services/digest";
import type { SynthesisService } from "../../../src/services/synthesis";
import type { AppConfig, ScannedDocument, SecondBrainConfig } from "../../../src/types";

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
    daily: { enabled: true, time: "07:00", timezone: "UTC", limit: 3 },
    weekly: { enabled: true, day: "sunday", time: "16:00", timezone: "UTC" },
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

function makeDoc(overrides: Partial<ScannedDocument>): ScannedDocument {
  return {
    filename: "test-20260207-143015.md",
    filepath: "/tmp/test-secondbrain/Admin/test-20260207-143015.md",
    category: "admin",
    content: "Test content",
    frontmatter: { category: "admin", name: "Test", confidence: 0.8 },
    created: new Date("2026-02-07T14:30:15.000Z"),
    modified: new Date("2026-02-07T14:30:15.000Z"),
    title: "Test",
    confidence: 0.8,
    ...overrides,
  };
}

function createMockClaude(response: string): ClaudeService {
  return {
    call: vi.fn().mockResolvedValue(response),
    buildPrompt: vi.fn(),
    detectIntents: vi.fn(),
  } as unknown as ClaudeService;
}

function createMockSynthesis(actions: ScannedDocument[]): SynthesisService {
  return {
    getDailyActions: vi.fn().mockResolvedValue(actions),
    getStats: vi.fn().mockResolvedValue({
      total: 10,
      week: 3,
      today: 1,
      byCategory: { people: 4, projects: 3, ideas: 2, admin: 1 },
      avgConfidence: 0.85,
      needsReview: 1,
      actionable: actions.length,
    }),
    prioritizeActions: vi.fn().mockReturnValue(actions),
  } as unknown as SynthesisService;
}

describe("DigestService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T14:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("generateDailyDigest", () => {
    it("builds prompt with action data and calls Claude", async () => {
      const actions = [
        makeDoc({
          category: "projects",
          title: "Website Redesign",
          frontmatter: {
            category: "projects",
            name: "Website Redesign",
            status: "active",
            next_action: "Design mockups",
            confidence: 0.9,
          },
        }),
        makeDoc({
          category: "people",
          title: "Sarah",
          frontmatter: {
            category: "people",
            name: "Sarah",
            follow_ups: "Call next week",
            confidence: 0.85,
          },
        }),
      ];

      const claudeService = createMockClaude("Here are your top priorities for today...");
      const synthesisService = createMockSynthesis(actions);

      const service = new DigestService(claudeService, synthesisService, mockConfig, mockLogger);
      const result = await service.generateDailyDigest();

      expect(result).toContain("top priorities");
      expect(claudeService.call).toHaveBeenCalledOnce();
      expect(synthesisService.getDailyActions).toHaveBeenCalledWith(3);
    });

    it("returns fallback message when no actionable items", async () => {
      const claudeService = createMockClaude("");
      const synthesisService = createMockSynthesis([]);

      const service = new DigestService(claudeService, synthesisService, mockConfig, mockLogger);
      const result = await service.generateDailyDigest();

      expect(result).toContain("No actionable items");
      expect(claudeService.call).not.toHaveBeenCalled();
    });

    it("returns error message on Claude failure", async () => {
      const actions = [makeDoc({ title: "Task" })];
      const claudeService = createMockClaude("Error: Claude CLI timed out after 120000ms");
      const synthesisService = createMockSynthesis(actions);

      const service = new DigestService(claudeService, synthesisService, mockConfig, mockLogger);
      const result = await service.generateDailyDigest();

      expect(result).toContain("Failed to generate");
    });
  });

  describe("generateWeeklyReview", () => {
    it("builds prompt with summary data and calls Claude", async () => {
      const claudeService = createMockClaude(
        "This week you captured 5 thoughts across 3 categories..."
      );
      const synthesisService = {
        ...createMockSynthesis([]),
        getWeeklySummary: vi.fn().mockResolvedValue({
          totalCaptures: 5,
          byCategory: { people: 2, projects: 2, ideas: 1 },
          activeProjects: [{ title: "Website", status: "active", filename: "website.md" }],
          peopleFollowups: [{ title: "Sarah", followUps: "Call next week", filename: "sarah.md" }],
          avgConfidence: 0.85,
          needsReviewCount: 1,
        }),
      } as unknown as SynthesisService;

      const service = new DigestService(claudeService, synthesisService, mockConfig, mockLogger);
      const result = await service.generateWeeklyReview();

      expect(result).toContain("captured 5 thoughts");
      expect(claudeService.call).toHaveBeenCalledOnce();
    });

    it("returns fallback for empty week", async () => {
      const claudeService = createMockClaude("");
      const synthesisService = {
        ...createMockSynthesis([]),
        getWeeklySummary: vi.fn().mockResolvedValue({
          totalCaptures: 0,
          byCategory: {},
          activeProjects: [],
          peopleFollowups: [],
          avgConfidence: 0,
          needsReviewCount: 0,
        }),
      } as unknown as SynthesisService;

      const service = new DigestService(claudeService, synthesisService, mockConfig, mockLogger);
      const result = await service.generateWeeklyReview();

      expect(result).toContain("No captures");
      expect(claudeService.call).not.toHaveBeenCalled();
    });
  });
});
