/**
 * Structured logging with Pino
 */

import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

const level = (process.env["LOG_LEVEL"] as LogLevel) || "info";

export const logger = pino({
  level,
  transport:
    process.env["NODE_ENV"] === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    service: "claude-telegram-relay",
  },
});

/**
 * Create a child logger with additional context
 */
export function createLogger(name: string) {
  return logger.child({ module: name });
}

/**
 * Log levels for reference:
 * - debug: Detailed debugging information
 * - info: General operational information
 * - warn: Warning conditions that may need attention
 * - error: Error conditions that need immediate attention
 */
