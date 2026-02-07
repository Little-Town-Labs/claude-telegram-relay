/**
 * Claude Telegram Relay - Entry Point
 *
 * Modular entry point that validates configuration,
 * sets up services, and starts the relay.
 *
 * Run: npm run start
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import { Bot } from "grammy";

import { validateConfig } from "./config";
import {
  ClaudeService,
  MemoryService,
  SessionManager,
  handleDocument,
  handlePhoto,
  handleVoice,
} from "./services";
import type { AppConfig } from "./types";
import {
  MessageQueue,
  createLockManager,
  createLogger,
  sendResponse,
  setupLockCleanup,
} from "./utils";

// Re-export for backwards compatibility
export * from "./types";
export * from "./config";
export * from "./utils";

const log = createLogger("main");
const execFileAsync = promisify(execFile);

/**
 * Verify Claude CLI is available before starting.
 */
async function checkClaudeCli(claudePath: string): Promise<void> {
  try {
    await execFileAsync(claudePath, ["--version"]);
    log.info("Claude CLI available");
  } catch {
    log.error({ claudePath }, "Claude CLI not found. Install it or set CLAUDE_PATH.");
    process.exit(1);
  }
}

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

  // Check Claude CLI availability
  await checkClaudeCli(config.claudePath);

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
  const claudeService = new ClaudeService(config, createLogger("claude"));
  const sessionManager = new SessionManager(
    config.sessionFile,
    config.sessionTtlMs,
    createLogger("session")
  );
  const memoryService = new MemoryService(config.memoryFile, createLogger("memory"));
  const queue = new MessageQueue();

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

  // /new command — reset session
  bot.command("new", async (ctx) => {
    await sessionManager.clear();
    await ctx.reply("Session cleared. Starting fresh conversation.");
  });

  // Text message handler
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    log.info({ text: text.substring(0, 50) }, "Message received");

    // Send typing indicator before processing
    await ctx.replyWithChatAction("typing");

    queue.enqueue(async () => {
      const session = await sessionManager.load();
      const memoryContext = await memoryService.getContext();
      const prompt = claudeService.buildPrompt(text, memoryContext || undefined);
      const response = await claudeService.call(prompt, {
        resume: session.sessionId !== null,
      });

      // Update session with activity (use existing sessionId or generate placeholder)
      const sessionId = session.sessionId ?? crypto.randomUUID();
      await sessionManager.updateActivity(sessionId);

      // Process intent markers from Claude's response
      const { cleaned, intents, confirmations } = claudeService.detectIntents(response);

      if (intents.remember) {
        await memoryService.addFact(intents.remember);
      }
      if (intents.goal) {
        await memoryService.addGoal(intents.goal.text, intents.goal.deadline);
      }
      if (intents.done) {
        await memoryService.completeGoal(intents.done);
      }

      // Send cleaned response with confirmations appended
      let finalResponse = cleaned;
      if (confirmations.length > 0) {
        finalResponse += `\n\n${confirmations.join("\n")}`;
      }

      await sendResponse(ctx, finalResponse);
    });
  });

  // Media handler options
  const mediaOptions = {
    claudeCall: (prompt: string, options: { resume?: boolean }) =>
      claudeService.call(prompt, options),
    uploadsDir: config.uploadsDir,
    botToken: config.botToken,
    logger: createLogger("media"),
  };

  // Photo handler
  bot.on("message:photo", async (ctx) => {
    log.info("Photo received");
    await ctx.replyWithChatAction("typing");

    queue.enqueue(async () => {
      const response = await handlePhoto(ctx, mediaOptions);
      await sendResponse(ctx, response);
    });
  });

  // Document handler
  bot.on("message:document", async (ctx) => {
    const fileName = ctx.message.document.file_name;
    log.info({ fileName }, "Document received");
    await ctx.replyWithChatAction("typing");

    queue.enqueue(async () => {
      const response = await handleDocument(ctx, mediaOptions);
      await sendResponse(ctx, response);
    });
  });

  // Voice handler
  bot.on("message:voice", async (ctx) => {
    log.info("Voice message received");
    await ctx.reply(handleVoice());
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
