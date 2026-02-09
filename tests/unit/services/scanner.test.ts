import * as fs from "fs/promises";
import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScannerService } from "../../../src/services/scanner";
import type { AppConfig, SecondBrainConfig } from "../../../src/types";
import { stringifyFrontmatter } from "../../../src/utils/frontmatter";

vi.mock("fs/promises");

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

function makeMdFile(frontmatter: Record<string, unknown>, body: string): string {
  return stringifyFrontmatter(frontmatter, body);
}

describe("ScannerService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T14:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("scanAllDocuments", () => {
    it("reads .md files from all category directories", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      // readdir returns category directories
      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        const dir = String(dirPath);
        if (dir === "/tmp/test-secondbrain") {
          return ["People", "Projects", "Ideas", "Admin", "_needs_review"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dir.endsWith("/People")) {
          return ["sarah-20260207-143015.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        if (dir.endsWith("/Projects")) {
          return ["website-20260206-100000.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const fp = String(filePath);
        if (fp.includes("sarah")) {
          return makeMdFile(
            { category: "people", name: "Sarah", confidence: 0.92, created: "2026-02-07 14:30:15" },
            "## Original Thought\n\nHad a call with Sarah"
          );
        }
        if (fp.includes("website")) {
          return makeMdFile(
            {
              category: "projects",
              name: "Website",
              confidence: 0.85,
              status: "active",
              created: "2026-02-06 10:00:00",
            },
            "## Original Thought\n\nWebsite redesign"
          );
        }
        return "";
      });

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const docs = await service.scanAllDocuments();

      expect(docs).toHaveLength(2);
      expect(docs.map((d) => d.category)).toContain("people");
      expect(docs.map((d) => d.category)).toContain("projects");
    });

    it("handles empty directories gracefully", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof fs.readdir>>
      );

      const docs = await service.scanAllDocuments();
      expect(docs).toHaveLength(0);
    });

    it("handles missing data directory", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const docs = await service.scanAllDocuments();
      expect(docs).toHaveLength(0);
    });
  });

  describe("scanCategory", () => {
    it("reads .md files from a single category directory", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockResolvedValue([
        "sarah-20260207-143015.md",
        "bob-20260206-090000.md",
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const fp = String(filePath);
        if (fp.includes("sarah")) {
          return makeMdFile(
            { category: "people", name: "Sarah", confidence: 0.92, created: "2026-02-07 14:30:15" },
            "Call with Sarah"
          );
        }
        return makeMdFile(
          { category: "people", name: "Bob", confidence: 0.8, created: "2026-02-06 09:00:00" },
          "Met Bob at conference"
        );
      });

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const docs = await service.scanCategory("people");
      expect(docs).toHaveLength(2);
      expect(docs[0]?.title).toBe("Sarah");
      expect(docs[1]?.title).toBe("Bob");
    });

    it("skips non-.md files", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockResolvedValue([
        "sarah.md",
        "notes.txt",
        ".DS_Store",
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      vi.mocked(fs.readFile).mockResolvedValue(
        makeMdFile(
          { category: "people", name: "Sarah", confidence: 0.9, created: "2026-02-07 14:30:15" },
          "Content"
        )
      );

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const docs = await service.scanCategory("people");
      expect(docs).toHaveLength(1);
    });

    it("handles missing category directory", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

      const docs = await service.scanCategory("ideas");
      expect(docs).toHaveLength(0);
    });
  });

  describe("getNeedsReview", () => {
    it("reads files from _needs_review directory", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockResolvedValue(["unclear-20260207-160000.md"] as unknown as Awaited<
        ReturnType<typeof fs.readdir>
      >);

      vi.mocked(fs.readFile).mockResolvedValue(
        makeMdFile(
          { category: "admin", name: "Unclear", confidence: 0.3, created: "2026-02-07 16:00:00" },
          "Some vague thought"
        )
      );

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const docs = await service.getNeedsReview();
      expect(docs).toHaveLength(1);
      expect(docs[0]?.confidence).toBe(0.3);
    });
  });

  describe("filterByDate", () => {
    it("filters documents by number of days ago", () => {
      const service = new ScannerService(mockConfig, mockLogger);

      const docs = [
        { created: new Date("2026-02-07T10:00:00.000Z"), filename: "today.md" },
        { created: new Date("2026-02-05T10:00:00.000Z"), filename: "two-days-ago.md" },
        { created: new Date("2026-01-20T10:00:00.000Z"), filename: "old.md" },
      ] as Array<{ created: Date; filename: string; [key: string]: unknown }>;

      const recent = service.filterByDate(
        docs as unknown as import("../../../src/types").ScannedDocument[],
        7
      );
      expect(recent).toHaveLength(2);
      expect(recent.map((d) => d.filename)).toContain("today.md");
      expect(recent.map((d) => d.filename)).toContain("two-days-ago.md");
    });

    it("returns empty array when no documents match", () => {
      const service = new ScannerService(mockConfig, mockLogger);

      const docs = [
        { created: new Date("2025-01-01T00:00:00.000Z"), filename: "old.md" },
      ] as unknown as import("../../../src/types").ScannedDocument[];

      const recent = service.filterByDate(docs, 7);
      expect(recent).toHaveLength(0);
    });
  });

  describe("getActionableItems", () => {
    it("includes active projects", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        const dir = String(dirPath);
        if (dir === "/tmp/test-secondbrain") {
          return ["Projects"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        if (dir.endsWith("/Projects")) {
          return ["website.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      vi.mocked(fs.readFile).mockResolvedValue(
        makeMdFile(
          {
            category: "projects",
            name: "Website",
            status: "active",
            confidence: 0.9,
            created: "2026-02-07 10:00:00",
            next_action: "Design mockups",
          },
          "Website redesign"
        )
      );

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const items = await service.getActionableItems();
      expect(items).toHaveLength(1);
      expect(items[0]?.title).toBe("Website");
    });

    it("includes people with follow-ups", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        const dir = String(dirPath);
        if (dir === "/tmp/test-secondbrain") {
          return ["People"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        if (dir.endsWith("/People")) {
          return ["sarah.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      vi.mocked(fs.readFile).mockResolvedValue(
        makeMdFile(
          {
            category: "people",
            name: "Sarah",
            confidence: 0.9,
            created: "2026-02-07 10:00:00",
            follow_ups: "Call next week",
          },
          "Met Sarah"
        )
      );

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const items = await service.getActionableItems();
      expect(items).toHaveLength(1);
    });

    it("includes admin with due dates", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        const dir = String(dirPath);
        if (dir === "/tmp/test-secondbrain") {
          return ["Admin"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        if (dir.endsWith("/Admin")) {
          return ["meeting.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      vi.mocked(fs.readFile).mockResolvedValue(
        makeMdFile(
          {
            category: "admin",
            name: "Team Meeting",
            confidence: 0.8,
            created: "2026-02-07 10:00:00",
            due_date: "2026-02-10",
          },
          "Quarterly team meeting"
        )
      );

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const items = await service.getActionableItems();
      expect(items).toHaveLength(1);
    });

    it("filters out non-actionable items", async () => {
      const service = new ScannerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        const dir = String(dirPath);
        if (dir === "/tmp/test-secondbrain") {
          return ["Ideas"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        if (dir.endsWith("/Ideas")) {
          return ["idea.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      vi.mocked(fs.readFile).mockResolvedValue(
        makeMdFile(
          {
            category: "ideas",
            name: "Cool Idea",
            confidence: 0.7,
            created: "2026-02-07 10:00:00",
            one_liner: "Build something",
          },
          "An idea"
        )
      );

      vi.mocked(fs.stat).mockResolvedValue({
        mtimeMs: Date.now(),
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const items = await service.getActionableItems();
      expect(items).toHaveLength(0);
    });
  });
});
