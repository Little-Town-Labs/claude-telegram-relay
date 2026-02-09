import * as fs from "fs/promises";
import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixerService } from "../../../src/services/fixer";
import type { AppConfig, SecondBrainConfig } from "../../../src/types";
import { stringifyFrontmatter } from "../../../src/utils/frontmatter";

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

describe("FixerService", () => {
  beforeEach(() => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.appendFile).mockResolvedValue();
    vi.mocked(fs.unlink).mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fixCapture", () => {
    it("moves file to new category directory and updates frontmatter", async () => {
      const service = new FixerService(mockConfig, mockLogger);
      const originalContent = stringifyFrontmatter(
        { category: "admin", name: "Sarah", confidence: 0.5 },
        "## Original Thought\n\nHad a call with Sarah"
      );

      vi.mocked(fs.readFile).mockResolvedValue(originalContent);
      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        const dir = String(dirPath);
        if (dir.endsWith("/Admin")) {
          return ["sarah-20260207-143015.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      const result = await service.fixCapture("people", "sarah-20260207-143015.md");

      expect(result.success).toBe(true);
      expect(result.newCategory).toBe("people");
      expect(result.oldCategory).toBe("admin");
      expect(fs.writeFile).toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalled();

      // Verify new file has updated category
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const newContent = writeCall?.[1] as string;
      expect(newContent).toContain("category: people");
    });

    it("handles invalid category", async () => {
      const service = new FixerService(mockConfig, mockLogger);

      const result = await service.fixCapture("invalid_category", "test.md");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid category");
    });

    it("handles file not found", async () => {
      const service = new FixerService(mockConfig, mockLogger);

      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.readdir).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof fs.readdir>>
      );

      const result = await service.fixCapture("people", "nonexistent.md");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });
  });

  describe("findFileByName", () => {
    it("searches all category directories for a file", async () => {
      const service = new FixerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        const dir = String(dirPath);
        if (dir.endsWith("/People")) {
          return ["sarah.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      const result = await service.findFileByName("sarah.md");
      expect(result).toContain("/People/sarah.md");
    });

    it("returns null when file not found anywhere", async () => {
      const service = new FixerService(mockConfig, mockLogger);

      vi.mocked(fs.readdir).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof fs.readdir>>
      );

      const result = await service.findFileByName("nonexistent.md");
      expect(result).toBeNull();
    });
  });

  describe("findLastUserFile", () => {
    it("parses inbox log for last entry", async () => {
      const service = new FixerService(mockConfig, mockLogger);

      const inboxLog = `
---

**Timestamp:** 2026-02-07 14:30:15
**User:** 123456
**Category:** admin (confidence: 0.5)
**File:** \`sarah-20260207-143015.md\`
**Thought:** Had a call with Sarah...

---

**Timestamp:** 2026-02-07 15:00:00
**User:** 123456
**Category:** people (confidence: 0.9)
**File:** \`bob-20260207-150000.md\`
**Thought:** Met Bob at conference...
`;

      vi.mocked(fs.readFile).mockResolvedValue(inboxLog);

      const result = await service.findLastUserFile("123456");
      expect(result).toBe("bob-20260207-150000.md");
    });

    it("returns null when no entries for user", async () => {
      const service = new FixerService(mockConfig, mockLogger);

      vi.mocked(fs.readFile).mockResolvedValue("empty log");

      const result = await service.findLastUserFile("123456");
      expect(result).toBeNull();
    });
  });
});
