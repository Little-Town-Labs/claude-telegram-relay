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
  CaptureService,
  ClaudeService,
  DigestService,
  FixerService,
  MemoryService,
  ScannerService,
  SchedulerService,
  SessionManager,
  SynthesisService,
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

  // SecondBrain commands (only when enabled)
  if (config.secondbrain?.enabled) {
    const sbLog = createLogger("secondbrain");
    const captureService = new CaptureService(config, claudeService, sbLog);
    const scannerService = new ScannerService(config, sbLog);
    const synthesisService = new SynthesisService(scannerService, config, sbLog);
    const digestService = new DigestService(claudeService, synthesisService, config, sbLog);
    const fixerService = new FixerService(config, sbLog);
    const schedulerService = new SchedulerService(
      digestService,
      (chatId, text) => bot.api.sendMessage(chatId, text),
      config,
      sbLog
    );

    schedulerService.start();

    bot.command("capture", async (ctx) => {
      const text = ctx.match;
      if (!text) {
        await ctx.reply("Usage: /capture <your thought>");
        return;
      }
      await ctx.replyWithChatAction("typing");
      const result = await captureService.capture(text, ctx.from?.id.toString());
      const reviewNote = result.needsReview ? " (needs review)" : "";
      await ctx.reply(
        `Captured as **${result.category}** (${(result.confidence * 100).toFixed(0)}% confidence)${reviewNote}\nFile: \`${result.filename}\``,
        { parse_mode: "Markdown" }
      );
    });

    bot.command("stats", async (ctx) => {
      await ctx.replyWithChatAction("typing");
      const stats = await synthesisService.getStats();
      const lines = [
        "**Capture Statistics**",
        `Total: ${stats.total} | This week: ${stats.week} | Today: ${stats.today}`,
        `Avg confidence: ${(stats.avgConfidence * 100).toFixed(0)}%`,
        `Needs review: ${stats.needsReview}`,
        "",
        "**By Category:**",
        ...Object.entries(stats.byCategory).map(([cat, count]) => `  ${cat}: ${count}`),
      ];
      await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
    });

    bot.command("review", async (ctx) => {
      await ctx.replyWithChatAction("typing");
      const docs = await scannerService.getNeedsReview();
      if (docs.length === 0) {
        await ctx.reply("No items need review. All clear!");
        return;
      }
      const lines = ["**Items Needing Review:**", ""];
      for (const doc of docs) {
        lines.push(`- \`${doc.filename}\` (${(doc.confidence * 100).toFixed(0)}%) — ${doc.title}`);
      }
      lines.push("", "Use `/fix <filename> <category>` to reclassify.");
      await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
    });

    bot.command("digest", async (ctx) => {
      await ctx.replyWithChatAction("typing");
      const isWeekly = ctx.match?.trim().toLowerCase() === "weekly";
      const content = isWeekly
        ? await digestService.generateWeeklyReview()
        : await digestService.generateDailyDigest();
      await ctx.reply(content);
    });

    bot.command("fix", async (ctx) => {
      const args = ctx.match?.trim().split(/\s+/) ?? [];
      if (args.length === 1 && args[0]) {
        // /fix <category> — fix last capture
        const filename = await fixerService.findLastUserFile(ctx.from?.id.toString() ?? "");
        if (!filename) {
          await ctx.reply("No recent captures found to fix.");
          return;
        }
        const result = await fixerService.fixCapture(args[0], filename, ctx.from?.id.toString());
        await ctx.reply(result.message);
      } else if (args.length >= 2 && args[0] && args[1]) {
        // /fix <filename> <category>
        const result = await fixerService.fixCapture(args[1], args[0], ctx.from?.id.toString());
        await ctx.reply(result.message);
      } else {
        await ctx.reply("Usage: `/fix <category>` or `/fix <filename> <category>`", {
          parse_mode: "Markdown",
        });
      }
    });

    sbLog.info("SecondBrain commands registered");
  }

  // Text message handler
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    log.info({ text: text.substring(0, 50) }, "Message received");

    // Send typing indicator before processing
    await ctx.replyWithChatAction("typing");

    queue.enqueue(async () => {
      const memoryContext = await memoryService.getContext();
      const prompt = claudeService.buildPrompt(text, memoryContext || undefined);
      const response = await claudeService.call(prompt);

      // Update session activity tracking (no CLI session resumption)
      await sessionManager.updateActivity();

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
    claudeCall: (prompt: string) => claudeService.call(prompt),
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
