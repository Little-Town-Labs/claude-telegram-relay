import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DigestService } from "../../../src/services/digest";
import { SchedulerService } from "../../../src/services/scheduler";
import type { AppConfig, SecondBrainConfig } from "../../../src/types";

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

function createMockDigest(): DigestService {
  return {
    generateDailyDigest: vi.fn().mockResolvedValue("Daily digest content"),
    generateWeeklyReview: vi.fn().mockResolvedValue("Weekly review content"),
  } as unknown as DigestService;
}

const mockSendMessage = vi.fn().mockResolvedValue({});

describe("SchedulerService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T06:00:00.000Z")); // Saturday 6am UTC
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("start/stop", () => {
    it("sets timers on start and clears them on stop", () => {
      const digestService = createMockDigest();
      const service = new SchedulerService(digestService, mockSendMessage, mockConfig, mockLogger);

      service.start();
      const runs = service.getNextRuns();
      expect(Object.keys(runs)).toContain("daily");
      expect(Object.keys(runs)).toContain("weekly");

      service.stop();
    });

    it("does not set timers when digest is disabled", () => {
      const digestService = createMockDigest();
      const disabledConfig: AppConfig = {
        ...mockConfig,
        secondbrain: {
          ...secondbrainConfig,
          digest: {
            daily: { ...secondbrainConfig.digest.daily, enabled: false },
            weekly: { ...secondbrainConfig.digest.weekly, enabled: false },
          },
        },
      };

      const service = new SchedulerService(
        digestService,
        mockSendMessage,
        disabledConfig,
        mockLogger
      );
      service.start();
      const runs = service.getNextRuns();
      expect(Object.keys(runs)).toHaveLength(0);

      service.stop();
    });
  });

  describe("getNextRuns", () => {
    it("returns next trigger times", () => {
      const digestService = createMockDigest();
      const service = new SchedulerService(digestService, mockSendMessage, mockConfig, mockLogger);

      service.start();
      const runs = service.getNextRuns();
      expect(runs["daily"]).toBeDefined();
      expect(runs["daily"]?.name).toBe("daily");
      expect(runs["daily"]?.nextRun).toBeTruthy();

      service.stop();
    });
  });

  describe("triggerNow", () => {
    it("fires daily digest immediately", async () => {
      const digestService = createMockDigest();
      const service = new SchedulerService(digestService, mockSendMessage, mockConfig, mockLogger);

      await service.triggerNow("daily");

      expect(digestService.generateDailyDigest).toHaveBeenCalledOnce();
      expect(mockSendMessage).toHaveBeenCalledWith("123456", "Daily digest content");
    });

    it("fires weekly review immediately", async () => {
      const digestService = createMockDigest();
      const service = new SchedulerService(digestService, mockSendMessage, mockConfig, mockLogger);

      await service.triggerNow("weekly");

      expect(digestService.generateWeeklyReview).toHaveBeenCalledOnce();
      expect(mockSendMessage).toHaveBeenCalledWith("123456", "Weekly review content");
    });
  });
});
