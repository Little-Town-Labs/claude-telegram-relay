import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScannerService } from "../../../src/services/scanner";
import { SynthesisService } from "../../../src/services/synthesis";
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

function createMockScanner(
  docs: ScannedDocument[],
  reviewDocs: ScannedDocument[] = []
): ScannerService {
  return {
    scanAllDocuments: vi.fn().mockResolvedValue(docs),
    scanCategory: vi.fn().mockResolvedValue(docs),
    getNeedsReview: vi.fn().mockResolvedValue(reviewDocs),
    filterByDate: vi.fn().mockImplementation((items: ScannedDocument[], days: number) => {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return items.filter((d) => d.created.getTime() >= cutoff);
    }),
  } as unknown as ScannerService;
}

describe("SynthesisService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T14:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getStats", () => {
    it("returns total, weekly, daily counts and category breakdown", async () => {
      const docs: ScannedDocument[] = [
        makeDoc({
          category: "people",
          title: "Sarah",
          created: new Date("2026-02-07T10:00:00.000Z"),
        }),
        makeDoc({
          category: "people",
          title: "Bob",
          created: new Date("2026-02-06T10:00:00.000Z"),
        }),
        makeDoc({
          category: "projects",
          title: "Website",
          created: new Date("2026-02-05T10:00:00.000Z"),
        }),
        makeDoc({
          category: "ideas",
          title: "AI Tool",
          created: new Date("2026-01-15T10:00:00.000Z"),
        }),
      ];

      const reviewDocs = [makeDoc({ category: "admin", title: "Unclear", confidence: 0.3 })];

      const scanner = createMockScanner(docs, reviewDocs);
      const service = new SynthesisService(scanner, mockConfig, mockLogger);

      const stats = await service.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byCategory["people"]).toBe(2);
      expect(stats.byCategory["projects"]).toBe(1);
      expect(stats.byCategory["ideas"]).toBe(1);
      expect(stats.needsReview).toBe(1);
    });

    it("computes average confidence", async () => {
      const docs: ScannedDocument[] = [
        makeDoc({ confidence: 0.9 }),
        makeDoc({ confidence: 0.7 }),
        makeDoc({ confidence: 0.8 }),
      ];

      const scanner = createMockScanner(docs);
      const service = new SynthesisService(scanner, mockConfig, mockLogger);

      const stats = await service.getStats();
      expect(stats.avgConfidence).toBeCloseTo(0.8, 2);
    });

    it("returns zeros for empty data", async () => {
      const scanner = createMockScanner([]);
      const service = new SynthesisService(scanner, mockConfig, mockLogger);

      const stats = await service.getStats();

      expect(stats.total).toBe(0);
      expect(stats.week).toBe(0);
      expect(stats.today).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.needsReview).toBe(0);
    });

    it("counts today's captures", async () => {
      const docs: ScannedDocument[] = [
        makeDoc({ created: new Date("2026-02-07T10:00:00.000Z"), title: "Today 1" }),
        makeDoc({ created: new Date("2026-02-07T08:00:00.000Z"), title: "Today 2" }),
        makeDoc({ created: new Date("2026-02-06T10:00:00.000Z"), title: "Yesterday" }),
      ];

      const scanner = createMockScanner(docs);
      const service = new SynthesisService(scanner, mockConfig, mockLogger);

      const stats = await service.getStats();
      expect(stats.today).toBe(2);
    });

    it("counts this week's captures", async () => {
      const docs: ScannedDocument[] = [
        makeDoc({ created: new Date("2026-02-07T10:00:00.000Z") }),
        makeDoc({ created: new Date("2026-02-03T10:00:00.000Z") }),
        makeDoc({ created: new Date("2026-01-20T10:00:00.000Z") }),
      ];

      const scanner = createMockScanner(docs);
      const service = new SynthesisService(scanner, mockConfig, mockLogger);

      const stats = await service.getStats();
      expect(stats.week).toBe(2);
    });
  });

  describe("getDailyActions", () => {
    it("returns prioritized actionable items up to limit", async () => {
      const actionableItems: ScannedDocument[] = [
        makeDoc({
          category: "projects",
          title: "Website",
          status: "active",
          frontmatter: {
            category: "projects",
            name: "Website",
            status: "active",
            next_action: "Design",
            confidence: 0.9,
          },
          created: new Date("2026-02-07T10:00:00.000Z"),
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
          created: new Date("2026-02-06T10:00:00.000Z"),
        }),
        makeDoc({
          category: "admin",
          title: "Tax Filing",
          frontmatter: {
            category: "admin",
            name: "Tax Filing",
            due_date: "2026-02-08",
            confidence: 0.95,
          },
          created: new Date("2026-02-05T10:00:00.000Z"),
        }),
      ];

      const scanner = {
        scanAllDocuments: vi.fn().mockResolvedValue(actionableItems),
        getNeedsReview: vi.fn().mockResolvedValue([]),
        getActionableItems: vi.fn().mockResolvedValue(actionableItems),
        filterByDate: vi.fn().mockReturnValue(actionableItems),
      } as unknown as ScannerService;

      const service = new SynthesisService(scanner, mockConfig, mockLogger);
      const actions = await service.getDailyActions(2);

      expect(actions).toHaveLength(2);
    });

    it("returns empty array when no actionable items", async () => {
      const scanner = {
        scanAllDocuments: vi.fn().mockResolvedValue([]),
        getNeedsReview: vi.fn().mockResolvedValue([]),
        getActionableItems: vi.fn().mockResolvedValue([]),
        filterByDate: vi.fn().mockReturnValue([]),
      } as unknown as ScannerService;

      const service = new SynthesisService(scanner, mockConfig, mockLogger);
      const actions = await service.getDailyActions();

      expect(actions).toHaveLength(0);
    });
  });

  describe("prioritizeActions", () => {
    it("scores items with due dates higher", () => {
      const scanner = createMockScanner([]);
      const service = new SynthesisService(scanner, mockConfig, mockLogger);

      const items: ScannedDocument[] = [
        makeDoc({
          title: "No deadline",
          category: "projects",
          status: "active",
          frontmatter: {
            category: "projects",
            name: "No deadline",
            status: "active",
            confidence: 0.9,
          },
          created: new Date("2026-02-05T10:00:00.000Z"),
        }),
        makeDoc({
          title: "Has deadline",
          category: "admin",
          frontmatter: {
            category: "admin",
            name: "Has deadline",
            due_date: "2026-02-08",
            confidence: 0.9,
          },
          created: new Date("2026-02-05T10:00:00.000Z"),
        }),
      ];

      const sorted = service.prioritizeActions(items);
      expect(sorted[0]?.title).toBe("Has deadline");
    });

    it("scores today's items higher than older items", () => {
      const scanner = createMockScanner([]);
      const service = new SynthesisService(scanner, mockConfig, mockLogger);

      const items: ScannedDocument[] = [
        makeDoc({
          title: "Old item",
          created: new Date("2026-02-01T10:00:00.000Z"),
          frontmatter: {
            category: "projects",
            name: "Old item",
            status: "active",
            confidence: 0.9,
          },
        }),
        makeDoc({
          title: "Today item",
          created: new Date("2026-02-07T10:00:00.000Z"),
          frontmatter: {
            category: "projects",
            name: "Today item",
            status: "active",
            confidence: 0.9,
          },
        }),
      ];

      const sorted = service.prioritizeActions(items);
      expect(sorted[0]?.title).toBe("Today item");
    });
  });

  describe("getWeeklySummary", () => {
    it("returns summary with category breakdown and lists", async () => {
      const docs: ScannedDocument[] = [
        makeDoc({
          category: "projects",
          title: "Website",
          status: "active",
          confidence: 0.9,
          frontmatter: { category: "projects", name: "Website", status: "active", confidence: 0.9 },
          created: new Date("2026-02-05T10:00:00.000Z"),
        }),
        makeDoc({
          category: "people",
          title: "Sarah",
          confidence: 0.85,
          frontmatter: {
            category: "people",
            name: "Sarah",
            follow_ups: "Call next week",
            confidence: 0.85,
          },
          created: new Date("2026-02-06T10:00:00.000Z"),
        }),
        makeDoc({
          category: "ideas",
          title: "AI Tool",
          confidence: 0.7,
          frontmatter: { category: "ideas", name: "AI Tool", confidence: 0.7 },
          created: new Date("2026-02-07T10:00:00.000Z"),
        }),
      ];

      const reviewDocs = [makeDoc({ confidence: 0.3 })];

      const scanner = {
        scanAllDocuments: vi.fn().mockResolvedValue(docs),
        getNeedsReview: vi.fn().mockResolvedValue(reviewDocs),
        getActionableItems: vi.fn().mockResolvedValue([]),
        filterByDate: vi.fn().mockReturnValue(docs),
      } as unknown as ScannerService;

      const service = new SynthesisService(scanner, mockConfig, mockLogger);
      const summary = await service.getWeeklySummary();

      expect(summary.totalCaptures).toBe(3);
      expect(summary.byCategory["projects"]).toBe(1);
      expect(summary.byCategory["people"]).toBe(1);
      expect(summary.byCategory["ideas"]).toBe(1);
      expect(summary.activeProjects).toHaveLength(1);
      expect(summary.activeProjects[0]?.title).toBe("Website");
      expect(summary.peopleFollowups).toHaveLength(1);
      expect(summary.peopleFollowups[0]?.title).toBe("Sarah");
      expect(summary.avgConfidence).toBeCloseTo(0.817, 2);
      expect(summary.needsReviewCount).toBe(1);
    });

    it("returns empty summary for no data", async () => {
      const scanner = {
        scanAllDocuments: vi.fn().mockResolvedValue([]),
        getNeedsReview: vi.fn().mockResolvedValue([]),
        getActionableItems: vi.fn().mockResolvedValue([]),
        filterByDate: vi.fn().mockReturnValue([]),
      } as unknown as ScannerService;

      const service = new SynthesisService(scanner, mockConfig, mockLogger);
      const summary = await service.getWeeklySummary();

      expect(summary.totalCaptures).toBe(0);
      expect(summary.activeProjects).toHaveLength(0);
      expect(summary.peopleFollowups).toHaveLength(0);
      expect(summary.avgConfidence).toBe(0);
    });
  });
});
