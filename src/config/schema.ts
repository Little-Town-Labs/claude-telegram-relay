/**
 * Configuration schema validation with Zod
 */

import { join } from "path";
import { z } from "zod";

const homeDir = process.env["HOME"] || "~";
const defaultRelayDir = join(homeDir, ".claude-relay");

export const configSchema = z.object({
  // Required
  botToken: z
    .string()
    .min(1, "TELEGRAM_BOT_TOKEN is required")
    .describe("Telegram bot token from @BotFather"),

  // Optional with defaults
  allowedUserId: z.string().default("").describe("Telegram user ID allowed to use the bot"),

  claudePath: z.string().default("claude").describe("Path to Claude CLI executable"),

  relayDir: z.string().default(defaultRelayDir).describe("Base directory for relay data"),

  nodeEnv: z
    .enum(["development", "production", "test"])
    .default("development")
    .describe("Environment mode"),

  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info").describe("Log level"),

  // Optional cloud persistence
  supabaseUrl: z.string().url().optional().describe("Supabase URL for cloud persistence"),

  supabaseAnonKey: z.string().optional().describe("Supabase anonymous key"),

  memoryFile: z.string().default("").describe("Path to local memory JSON file"),

  sessionTtlMs: z
    .number()
    .int()
    .positive()
    .default(86400000)
    .describe("Session inactivity timeout in milliseconds (default 24h)"),

  cliTimeoutMs: z
    .number()
    .int()
    .positive()
    .default(120000)
    .describe("Default timeout for Claude CLI invocations in milliseconds (default 2min)"),
});

export type ConfigInput = z.input<typeof configSchema>;
export type ConfigOutput = z.output<typeof configSchema>;

/**
 * Parse environment variables into config input
 */
export function parseEnvVars(): ConfigInput {
  return {
    botToken: process.env["TELEGRAM_BOT_TOKEN"] || "",
    allowedUserId: process.env["TELEGRAM_USER_ID"] || "",
    claudePath: process.env["CLAUDE_PATH"] || "claude",
    relayDir: process.env["RELAY_DIR"] || join(homeDir, ".claude-relay"),
    nodeEnv: (process.env["NODE_ENV"] as ConfigOutput["nodeEnv"]) || "development",
    logLevel: (process.env["LOG_LEVEL"] as ConfigOutput["logLevel"]) || "info",
    supabaseUrl: process.env["SUPABASE_URL"],
    supabaseAnonKey: process.env["SUPABASE_ANON_KEY"],
    memoryFile: process.env["MEMORY_FILE"] || "",
    sessionTtlMs: process.env["SESSION_TTL_MS"]
      ? Number.parseInt(process.env["SESSION_TTL_MS"], 10)
      : undefined,
    cliTimeoutMs: process.env["CLI_TIMEOUT_MS"]
      ? Number.parseInt(process.env["CLI_TIMEOUT_MS"], 10)
      : undefined,
  };
}
