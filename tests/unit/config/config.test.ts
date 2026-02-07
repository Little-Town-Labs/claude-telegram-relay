/**
 * Configuration loader tests
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadConfig, validateConfig } from "../../../src/config";
import { mockEnv } from "../../setup";

describe("Config Loader", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  test("loads valid configuration", () => {
    const config = loadConfig();

    expect(config.botToken).toBe("test-bot-token");
    expect(config.allowedUserId).toBe("123456789");
    expect(config.claudePath).toBe("/usr/bin/claude");
    expect(config.relayDir).toBe("/tmp/test-relay");
    expect(config.nodeEnv).toBe("test");
  });

  test("derives paths from relayDir", () => {
    const config = loadConfig();

    expect(config.tempDir).toBe("/tmp/test-relay/temp");
    expect(config.uploadsDir).toBe("/tmp/test-relay/uploads");
    expect(config.sessionFile).toBe("/tmp/test-relay/session.json");
    expect(config.lockFile).toBe("/tmp/test-relay/bot.lock");
    expect(config.memoryFile).toBe("/tmp/test-relay/memory.json");
  });

  test("throws on missing bot token", () => {
    restoreEnv();
    restoreEnv = mockEnv({ TELEGRAM_BOT_TOKEN: "" });

    expect(() => loadConfig()).toThrow("TELEGRAM_BOT_TOKEN is required");
  });

  test("uses defaults for optional values", () => {
    restoreEnv();
    restoreEnv = mockEnv({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_USER_ID: undefined,
      CLAUDE_PATH: undefined,
      LOG_LEVEL: undefined,
    });

    const config = loadConfig();

    expect(config.allowedUserId).toBe("");
    expect(config.claudePath).toBe("claude");
    expect(config.logLevel).toBe("info");
  });

  test("uses default sessionTtlMs and cliTimeoutMs", () => {
    const config = loadConfig();

    expect(config.sessionTtlMs).toBe(86400000);
    expect(config.cliTimeoutMs).toBe(120000);
  });

  test("reads sessionTtlMs and cliTimeoutMs from environment", () => {
    restoreEnv();
    restoreEnv = mockEnv({
      SESSION_TTL_MS: "3600000",
      CLI_TIMEOUT_MS: "60000",
    });

    const config = loadConfig();

    expect(config.sessionTtlMs).toBe(3600000);
    expect(config.cliTimeoutMs).toBe(60000);
  });

  test("reads MEMORY_FILE from environment", () => {
    restoreEnv();
    restoreEnv = mockEnv({
      MEMORY_FILE: "/custom/memory.json",
    });

    const config = loadConfig();

    expect(config.memoryFile).toBe("/custom/memory.json");
  });

  describe("validateConfig", () => {
    test("returns success with valid config", () => {
      const result = validateConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.config.botToken).toBe("test-bot-token");
      }
    });

    test("returns errors for invalid config", () => {
      restoreEnv();
      restoreEnv = mockEnv({ TELEGRAM_BOT_TOKEN: "" });

      const result = validateConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
