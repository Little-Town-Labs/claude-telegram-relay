/**
 * DigestService — generate daily/weekly digest summaries via Claude CLI.
 */

import { join } from "path";
import { readFile } from "fs/promises";
import type { Logger } from "pino";

import type { AppConfig, ScannedDocument, WeeklySummary } from "../types";
import type { ClaudeService } from "./claude";
import type { SynthesisService } from "./synthesis";

export class DigestService {
  private claudeService: ClaudeService;
  private synthesisService: SynthesisService;
  private config: AppConfig;
  private log: Logger;
  private dailyPromptTemplate: string | null = null;
  private weeklyPromptTemplate: string | null = null;

  constructor(
    claudeService: ClaudeService,
    synthesisService: SynthesisService,
    config: AppConfig,
    logger: Logger
  ) {
    this.claudeService = claudeService;
    this.synthesisService = synthesisService;
    this.config = config;
    this.log = logger;
  }

  /**
   * Generate a daily digest from actionable items via Claude CLI.
   * Returns formatted text ready for Telegram.
   */
  async generateDailyDigest(): Promise<string> {
    const limit = this.config.secondbrain?.digest.daily.limit ?? 3;
    const actions = await this.synthesisService.getDailyActions(limit);

    if (actions.length === 0) {
      return "No actionable items found for today. You're all caught up!";
    }

    const prompt = await this.buildDailyPrompt(actions, limit);
    const response = await this.claudeService.call(prompt);

    if (response.startsWith("Error:")) {
      this.log.warn({ response }, "Claude CLI error during digest generation");
      return "Failed to generate daily digest. Please try again later.";
    }

    return response;
  }

  private async buildDailyPrompt(actions: ScannedDocument[], limit: number): Promise<string> {
    const template = await this.loadDailyTemplate();

    const itemsText = actions
      .map((doc) => {
        const fm = doc.frontmatter;
        const parts = [`- **${doc.title}** [${doc.category}]`];
        if (fm["status"]) parts.push(`  Status: ${String(fm["status"])}`);
        if (fm["next_action"]) parts.push(`  Next: ${String(fm["next_action"])}`);
        if (fm["follow_ups"]) parts.push(`  Follow-up: ${String(fm["follow_ups"])}`);
        if (fm["due_date"]) parts.push(`  Due: ${String(fm["due_date"])}`);
        return parts.join("\n");
      })
      .join("\n\n");

    const today = new Date().toISOString().split("T")[0] ?? "";

    return template
      .replace("{{LIMIT}}", String(limit))
      .replace("{{DATE}}", today)
      .replace("{{ITEMS}}", itemsText);
  }

  private async loadDailyTemplate(): Promise<string> {
    if (this.dailyPromptTemplate) return this.dailyPromptTemplate;

    const candidates = [
      join(__dirname, "..", "prompts", "daily_digest.txt"),
      join(process.cwd(), "src", "prompts", "daily_digest.txt"),
    ];

    for (const candidate of candidates) {
      try {
        const content = await readFile(candidate, "utf-8");
        if (content) {
          this.dailyPromptTemplate = content;
          return content;
        }
      } catch {
        // Try next candidate
      }
    }

    // Fallback inline template
    this.dailyPromptTemplate =
      "Generate a daily digest for {{DATE}}. Top {{LIMIT}} actions:\n\n{{ITEMS}}\n\nFormat for Telegram with markdown.";
    return this.dailyPromptTemplate;
  }

  /**
   * Generate a weekly review from summary data via Claude CLI.
   */
  async generateWeeklyReview(): Promise<string> {
    const summary = await this.synthesisService.getWeeklySummary();

    if (summary.totalCaptures === 0) {
      return "No captures this week. Start capturing thoughts with /capture!";
    }

    const prompt = await this.buildWeeklyPrompt(summary);
    const response = await this.claudeService.call(prompt);

    if (response.startsWith("Error:")) {
      this.log.warn({ response }, "Claude CLI error during weekly review generation");
      return "Failed to generate weekly review. Please try again later.";
    }

    return response;
  }

  private async buildWeeklyPrompt(summary: WeeklySummary): Promise<string> {
    const template = await this.loadWeeklyTemplate();

    const summaryParts: string[] = [];
    summaryParts.push(`Total captures: ${summary.totalCaptures}`);
    summaryParts.push(
      `Categories: ${Object.entries(summary.byCategory)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`
    );
    summaryParts.push(`Average confidence: ${summary.avgConfidence.toFixed(2)}`);
    summaryParts.push(`Needs review: ${summary.needsReviewCount}`);

    if (summary.activeProjects.length > 0) {
      summaryParts.push("\nActive Projects:");
      for (const p of summary.activeProjects) {
        summaryParts.push(`- ${p.title} (${p.status ?? "active"})`);
      }
    }

    if (summary.peopleFollowups.length > 0) {
      summaryParts.push("\nPeople Follow-ups:");
      for (const p of summary.peopleFollowups) {
        summaryParts.push(`- ${p.title}: ${p.followUps ?? ""}`);
      }
    }

    const today = new Date().toISOString().split("T")[0] ?? "";

    return template.replace("{{DATE}}", today).replace("{{SUMMARY}}", summaryParts.join("\n"));
  }

  private async loadWeeklyTemplate(): Promise<string> {
    if (this.weeklyPromptTemplate) return this.weeklyPromptTemplate;

    const candidates = [
      join(__dirname, "..", "prompts", "weekly_review.txt"),
      join(process.cwd(), "src", "prompts", "weekly_review.txt"),
    ];

    for (const candidate of candidates) {
      try {
        const content = await readFile(candidate, "utf-8");
        if (content) {
          this.weeklyPromptTemplate = content;
          return content;
        }
      } catch {
        // Try next candidate
      }
    }

    this.weeklyPromptTemplate =
      "Generate a weekly review for week ending {{DATE}}.\n\n{{SUMMARY}}\n\nFormat for Telegram with markdown.";
    return this.weeklyPromptTemplate;
  }
}
