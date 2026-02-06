/**
 * Claude Telegram Relay - Entry Point
 *
 * This is the new modular entry point. It validates configuration,
 * sets up logging, and starts the relay.
 *
 * Run: bun run src/index.ts
 */

import { mkdir } from "fs/promises";
import { Bot } from "grammy";

import { validateConfig } from "./config";
import type { AppConfig } from "./types";
import { createLockManager, createLogger, sendResponse, setupLockCleanup } from "./utils";

// Re-export for backwards compatibility
export * from "./types";
export * from "./config";
export * from "./utils";

const log = createLogger("main");

async function main(): Promise<void> {
  // Validate configuration
  const validation = validateConfig();
  if (!validation.success) {
    console.error("Configuration error:");
    for (const error of validation.errors) {
      console.error(error);
    }
    console.log("\nSetup instructions:");
    console.log("1. Copy .env.example to .env");
    console.log("2. Set TELEGRAM_BOT_TOKEN from @BotFather");
    console.log("3. Set TELEGRAM_USER_ID (your Telegram user ID)");
    process.exit(1);
  }

  const config = validation.config;
  log.info({ nodeEnv: config.nodeEnv }, "Configuration loaded");

  // Create required directories
  await mkdir(config.tempDir, { recursive: true });
  await mkdir(config.uploadsDir, { recursive: true });
  log.debug({ tempDir: config.tempDir, uploadsDir: config.uploadsDir }, "Directories created");

  // Acquire lock
  const lockManager = createLockManager(config.lockFile);
  if (!(await lockManager.acquire())) {
    log.error("Could not acquire lock. Another instance may be running.");
    process.exit(1);
  }
  setupLockCleanup(config.lockFile);
  log.debug("Lock acquired");

  // Start bot
  await startBot(config);
}

async function startBot(config: AppConfig): Promise<void> {
  const bot = new Bot(config.botToken);

  // Auth middleware
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id.toString();

    if (config.allowedUserId && userId !== config.allowedUserId) {
      log.warn({ userId }, "Unauthorized access attempt");
      await ctx.reply("This bot is private.");
      return;
    }

    await next();
  });

  // Text message handler
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    log.info({ text: text.substring(0, 50) }, "Message received");

    await ctx.replyWithChatAction("typing");

    // TODO: Phase 2 will add ClaudeService with buildPrompt
    // For now, just echo back to confirm relay is working
    await sendResponse(
      ctx,
      `[Relay Ready]\n\nReceived: ${text}\n\nUse 'bun run relay' for full Claude integration.`
    );
  });

  log.info({ allowedUserId: config.allowedUserId || "ANY" }, "Starting Claude Telegram Relay");

  bot.start({
    onStart: () => {
      log.info("Bot is running");
    },
  });
}

// Run if this is the main module
main().catch((error) => {
  log.error({ error }, "Fatal error");
  process.exit(1);
});
