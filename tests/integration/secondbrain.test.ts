/**
 * Integration tests for the SecondBrain pipeline.
 *
 * Tests the full flow: capture → scan → synthesize → digest
 * with mocked Claude CLI and real filesystem operations in a temp directory.
 */

import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, readFile, readdir, rm } from "fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppConfig } from "../../src/types";

// Mock child_process for Claude CLI calls
vi.mock("child_process");

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as any;
}

function createTestConfig(dataDir: string): AppConfig {
  return {
    botToken: "test-token",
    allowedUserId: "123",
    claudePath: "/usr/bin/claude",
    relayDir: dataDir,
    tempDir: join(dataDir, "tmp"),
    uploadsDir: join(dataDir, "uploads"),
    sessionFile: join(dataDir, "session.json"),
    lockFile: join(dataDir, "lock"),
    memoryFile: join(dataDir, "memory.json"),
    sessionTtlMs: 86400000,
    cliTimeoutMs: 120000,
    nodeEnv: "test",
    logLevel: "debug",
    secondbrain: {
      enabled: true,
      dataDir,
      confidenceThreshold: 0.6,
      chatId: "123",
      gitEnabled: false,
      gitAutoCommit: false,
      digest: {
        daily: { enabled: false, time: "09:00", timezone: "UTC", limit: 3 },
        weekly: { enabled: false, day: "sunday", time: "18:00", timezone: "UTC" },
      },
    },
  };
}

describe("SecondBrain Integration", () => {
  let tempDir: string;
  let config: AppConfig;
  const logger = createMockLogger();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-09T12:00:00Z"));
    tempDir = await mkdtemp(join(tmpdir(), "sb-integration-"));
    config = createTestConfig(tempDir);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("capture → scan → stats end-to-end", () => {
    test("capturing a thought creates a scannable file with correct stats", async () => {
      // Use real timers since spawn mock uses setTimeout
      vi.useRealTimers();
      vi.setSystemTime(new Date("2026-02-09T12:00:00Z"));

      const { spawn } = await import("child_process");
      const { CaptureService } = await import("../../src/services/capture");
      const { ScannerService } = await import("../../src/services/scanner");
      const { SynthesisService } = await import("../../src/services/synthesis");

      // Mock Claude CLI to return a classification
      const classifyResponse = JSON.stringify({
        category: "people",
        confidence: 0.85,
        reasoning: "Mentions a person by name with context about a call",
        extracted_data: {
          name: "Sarah",
          context: "Marketing strategy discussion",
          follow_ups: "Send proposal by Friday",
        },
      });

      vi.mocked(spawn).mockImplementation((_cmd, _args?, _opts?) => {
        const { Readable, Writable } = require("stream");
        const stdout = new Readable({ read() {} });
        const stderr = new Readable({ read() {} });
        const stdin = new Writable({
          write(_c: any, _e: any, cb: any) {
            cb();
          },
        });
        const child = Object.assign(new (require("events").EventEmitter)(), {
          stdout,
          stderr,
          stdin,
          pid: 12345,
          kill: vi.fn(),
        });
        setTimeout(() => {
          stdout.push(classifyResponse);
          stdout.push(null);
          child.emit("close", 0);
        }, 10);
        return child as any;
      });

      // Create services
      const { ClaudeService } = await import("../../src/services/claude");
      const claudeService = new ClaudeService(config, logger);
      const captureService = new CaptureService(config, claudeService, logger);
      const scannerService = new ScannerService(config, logger);
      const synthesisService = new SynthesisService(scannerService, config, logger);

      // Step 1: Capture a thought
      const result = await captureService.capture(
        "Had a call with Sarah about marketing strategy",
        "user-123"
      );

      expect(result.category).toBe("people");
      expect(result.confidence).toBe(0.85);
      expect(result.needsReview).toBe(false);
      expect(result.filename).toContain("sarah");

      // Step 2: Verify file exists on disk
      const peopleDir = join(tempDir, "People");
      const files = await readdir(peopleDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^sarah-.*\.md$/);

      // Step 3: Read the file and verify frontmatter
      const fileContent = await readFile(join(peopleDir, files[0]!), "utf-8");
      expect(fileContent).toContain("category: people");
      expect(fileContent).toContain("confidence: 0.85");
      expect(fileContent).toContain("Sarah");
      expect(fileContent).toContain("Marketing strategy discussion");

      // Step 4: Scan documents
      const scannedDocs = await scannerService.scanAllDocuments();
      expect(scannedDocs).toHaveLength(1);
      expect(scannedDocs[0]!.category).toBe("people");
      expect(scannedDocs[0]!.title).toBe("Sarah");

      // Step 5: Get stats
      const stats = await synthesisService.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byCategory["people"]).toBe(1);
      expect(stats.avgConfidence).toBe(0.85);
    });
  });

  describe("capture → scan → actionable → digest", () => {
    test("actionable items flow through to digest generation", async () => {
      vi.useRealTimers();

      const { spawn } = await import("child_process");
      const { CaptureService } = await import("../../src/services/capture");
      const { ScannerService } = await import("../../src/services/scanner");
      const { SynthesisService } = await import("../../src/services/synthesis");
      const { DigestService } = await import("../../src/services/digest");
      const { ClaudeService } = await import("../../src/services/claude");

      let callCount = 0;

      vi.mocked(spawn).mockImplementation((_cmd, _args?, _opts?) => {
        callCount++;
        const { Readable, Writable } = require("stream");
        const stdout = new Readable({ read() {} });
        const stderr = new Readable({ read() {} });
        const stdin = new Writable({
          write(_c: any, _e: any, cb: any) {
            cb();
          },
        });
        const child = Object.assign(new (require("events").EventEmitter)(), {
          stdout,
          stderr,
          stdin,
          pid: 12345,
          kill: vi.fn(),
        });

        let response: string;
        if (callCount === 1) {
          // First call: classification of project thought
          response = JSON.stringify({
            category: "projects",
            confidence: 0.9,
            reasoning: "Active project with clear next action",
            extracted_data: {
              name: "Website Redesign",
              status: "active",
              next_action: "Review wireframes with team",
              notes: "Deadline is urgent",
            },
          });
        } else {
          // Second call: daily digest generation
          response =
            "**Daily Digest - Feb 9, 2026**\n\n" +
            "1. **Website Redesign** - Review wireframes with team (urgent)\n\n" +
            "Stay focused today!";
        }

        setTimeout(() => {
          stdout.push(response);
          stdout.push(null);
          child.emit("close", 0);
        }, 10);
        return child as any;
      });

      const claudeService = new ClaudeService(config, logger);
      const captureService = new CaptureService(config, claudeService, logger);
      const scannerService = new ScannerService(config, logger);
      const synthesisService = new SynthesisService(scannerService, config, logger);
      const digestService = new DigestService(claudeService, synthesisService, config, logger);

      // Step 1: Capture a project thought
      const result = await captureService.capture(
        "Website redesign - need to review wireframes urgently"
      );
      expect(result.category).toBe("projects");

      // Step 2: Verify it's actionable
      const actionable = await scannerService.getActionableItems();
      expect(actionable).toHaveLength(1);
      expect(actionable[0]!.frontmatter["status"]).toBe("active");

      // Step 3: Verify prioritization scores urgency
      const prioritized = synthesisService.prioritizeActions(actionable);
      expect(prioritized).toHaveLength(1);

      // Step 4: Generate daily digest
      const digest = await digestService.generateDailyDigest();
      expect(digest).toContain("Website Redesign");
      expect(digest).toContain("wireframes");

      // Claude CLI was called exactly twice: classify + digest
      expect(callCount).toBe(2);
    });
  });

  describe("low confidence → needs_review flow", () => {
    test("low confidence capture goes to _needs_review and appears in review list", async () => {
      vi.useRealTimers();

      const { spawn } = await import("child_process");
      const { CaptureService } = await import("../../src/services/capture");
      const { ScannerService } = await import("../../src/services/scanner");
      const { ClaudeService } = await import("../../src/services/claude");

      vi.mocked(spawn).mockImplementation((_cmd, _args?, _opts?) => {
        const { Readable, Writable } = require("stream");
        const stdout = new Readable({ read() {} });
        const stderr = new Readable({ read() {} });
        const stdin = new Writable({
          write(_c: any, _e: any, cb: any) {
            cb();
          },
        });
        const child = Object.assign(new (require("events").EventEmitter)(), {
          stdout,
          stderr,
          stdin,
          pid: 12345,
          kill: vi.fn(),
        });

        const response = JSON.stringify({
          category: "ideas",
          confidence: 0.3,
          reasoning: "Ambiguous thought, could be several categories",
          extracted_data: { name: "something vague", one_liner: "not sure what this is" },
        });

        setTimeout(() => {
          stdout.push(response);
          stdout.push(null);
          child.emit("close", 0);
        }, 10);
        return child as any;
      });

      const claudeService = new ClaudeService(config, logger);
      const captureService = new CaptureService(config, claudeService, logger);
      const scannerService = new ScannerService(config, logger);

      // Capture with low confidence
      const result = await captureService.capture("something vague I thought of");
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe(0.3);

      // Verify file is in _needs_review
      const reviewDir = join(tempDir, "_needs_review");
      const files = await readdir(reviewDir);
      expect(files).toHaveLength(1);

      // Verify it shows up in getNeedsReview
      const needsReview = await scannerService.getNeedsReview();
      expect(needsReview).toHaveLength(1);
      expect(needsReview[0]!.confidence).toBe(0.3);
    });
  });

  describe("weekly review summary", () => {
    test("weekly summary aggregates captures correctly", async () => {
      vi.useRealTimers();

      const { spawn } = await import("child_process");
      const { CaptureService } = await import("../../src/services/capture");
      const { ScannerService } = await import("../../src/services/scanner");
      const { SynthesisService } = await import("../../src/services/synthesis");
      const { DigestService } = await import("../../src/services/digest");
      const { ClaudeService } = await import("../../src/services/claude");

      let callCount = 0;
      const responses = [
        // Capture 1: person
        JSON.stringify({
          category: "people",
          confidence: 0.9,
          reasoning: "Person mentioned",
          extracted_data: { name: "Alice", context: "Team meeting", follow_ups: "Send notes" },
        }),
        // Capture 2: project
        JSON.stringify({
          category: "projects",
          confidence: 0.85,
          reasoning: "Project update",
          extracted_data: {
            name: "API Migration",
            status: "active",
            next_action: "Deploy staging",
          },
        }),
        // Weekly review generation
        "**Weekly Review - Feb 9, 2026**\n\nTotal captures: 2\nActive projects: API Migration\nPeople: Alice (follow-up pending)",
      ];

      vi.mocked(spawn).mockImplementation((_cmd, _args?, _opts?) => {
        const { Readable, Writable } = require("stream");
        const stdout = new Readable({ read() {} });
        const stderr = new Readable({ read() {} });
        const stdin = new Writable({
          write(_c: any, _e: any, cb: any) {
            cb();
          },
        });
        const child = Object.assign(new (require("events").EventEmitter)(), {
          stdout,
          stderr,
          stdin,
          pid: 12345,
          kill: vi.fn(),
        });

        const response = responses[callCount] ?? "Error: no response";
        callCount++;

        setTimeout(() => {
          stdout.push(response);
          stdout.push(null);
          child.emit("close", 0);
        }, 10);
        return child as any;
      });

      const claudeService = new ClaudeService(config, logger);
      const captureService = new CaptureService(config, claudeService, logger);
      const scannerService = new ScannerService(config, logger);
      const synthesisService = new SynthesisService(scannerService, config, logger);
      const digestService = new DigestService(claudeService, synthesisService, config, logger);

      // Capture multiple thoughts
      await captureService.capture("Meeting with Alice about Q1 plans");
      await captureService.capture("API migration is progressing well, need to deploy staging");

      // Get weekly summary
      const summary = await synthesisService.getWeeklySummary();
      expect(summary.totalCaptures).toBe(2);
      expect(summary.byCategory["people"]).toBe(1);
      expect(summary.byCategory["projects"]).toBe(1);
      expect(summary.activeProjects).toHaveLength(1);
      expect(summary.activeProjects[0]!.title).toBe("API Migration");
      expect(summary.peopleFollowups).toHaveLength(1);
      expect(summary.peopleFollowups[0]!.title).toBe("Alice");

      // Generate weekly review
      const review = await digestService.generateWeeklyReview();
      expect(review).toContain("Weekly Review");
      expect(review).toContain("API Migration");
    });
  });
});
