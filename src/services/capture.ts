/**
 * CaptureService — classify thoughts via Claude CLI and store as markdown files.
 */

import { spawn } from "child_process";
import { join } from "path";
import { readFile } from "fs/promises";
import { appendFile, mkdir, writeFile } from "fs/promises";
import type { Logger } from "pino";
import { z } from "zod";

import type { AppConfig, CaptureResult, Category, Classification } from "../types";
import { stringifyFrontmatter } from "../utils/frontmatter";
import type { ClaudeService } from "./claude";

const CATEGORY_DIRS: Record<Category, string> = {
  people: "People",
  projects: "Projects",
  ideas: "Ideas",
  admin: "Admin",
};

const classificationSchema = z.object({
  category: z.enum(["people", "projects", "ideas", "admin"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  extracted_data: z.record(z.unknown()),
});

export class CaptureService {
  private config: AppConfig;
  private claudeService: ClaudeService;
  private log: Logger;
  private dataDir: string;
  private confidenceThreshold: number;
  private classifyPrompt: string | null = null;

  constructor(config: AppConfig, claudeService: ClaudeService, logger: Logger) {
    this.config = config;
    this.claudeService = claudeService;
    this.log = logger;
    this.dataDir = config.secondbrain?.dataDir ?? join(config.relayDir, "secondbrain");
    this.confidenceThreshold = config.secondbrain?.confidenceThreshold ?? 0.6;
  }

  /**
   * Classify a thought using Claude CLI.
   * Never throws — returns fallback classification on error.
   */
  async classify(thought: string): Promise<Classification> {
    const prompt = await this.buildClassifyPrompt(thought);
    const response = await this.claudeService.call(prompt);

    if (response.startsWith("Error:")) {
      this.log.warn({ response }, "Claude CLI returned error during classification");
      return this.fallbackClassification(thought);
    }

    try {
      const json = this.extractJson(response);
      const parsed = classificationSchema.parse(JSON.parse(json));
      return {
        category: parsed.category,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        extracted_data: parsed.extracted_data as unknown as Classification["extracted_data"],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn({ error: message }, "Failed to parse classification response");
      return this.fallbackClassification(thought);
    }
  }

  /**
   * Process a classified thought: create markdown file, log to inbox, optionally git commit.
   */
  async processCapture(
    thought: string,
    classification: Classification,
    userId?: string
  ): Promise<CaptureResult> {
    const needsReview = classification.confidence < this.confidenceThreshold;
    const targetDir = needsReview
      ? join(this.dataDir, "_needs_review")
      : join(this.dataDir, CATEGORY_DIRS[classification.category] ?? "Admin");

    await mkdir(targetDir, { recursive: true });

    const filename = this.generateFilename(classification);
    const filePath = join(targetDir, filename);

    // Build frontmatter metadata
    const metadata: Record<string, unknown> = {
      category: classification.category,
      confidence: classification.confidence,
      created: this.formatTimestamp(),
      ...this.flattenExtractedData(
        classification.extracted_data as unknown as Record<string, unknown>
      ),
    };

    // Build markdown body
    const bodyParts: string[] = [];
    const data = classification.extracted_data as unknown as Record<string, unknown>;

    if (data["context"]) {
      bodyParts.push(`## Context\n\n${String(data["context"])}`);
    }
    if (data["follow_ups"]) {
      bodyParts.push(`## Follow Ups\n\n${String(data["follow_ups"])}`);
    }
    if (data["next_action"]) {
      bodyParts.push(`## Next Action\n\n${String(data["next_action"])}`);
    }
    if (data["one_liner"]) {
      bodyParts.push(`## One Liner\n\n${String(data["one_liner"])}`);
    }
    if (data["notes"]) {
      bodyParts.push(`## Notes\n\n${String(data["notes"])}`);
    }

    bodyParts.push(`## Original Thought\n\n${thought}`);
    bodyParts.push(`## Classification Reasoning\n\n${classification.reasoning}`);

    const content = bodyParts.join("\n\n");
    const fileContent = stringifyFrontmatter(metadata, content);

    await writeFile(filePath, fileContent, "utf-8");
    this.log.info({ filePath, category: classification.category }, "Capture saved");

    // Log to inbox
    await this.logToInbox(thought, classification, filePath, userId);

    // Git commit if enabled
    if (this.config.secondbrain?.gitEnabled && this.config.secondbrain.gitAutoCommit) {
      await this.gitCommit(filePath, classification.category);
    }

    return {
      filePath,
      category: classification.category,
      confidence: classification.confidence,
      needsReview,
      filename,
    };
  }

  /**
   * Convenience: classify + processCapture in one call.
   */
  async capture(thought: string, userId?: string): Promise<CaptureResult> {
    const classification = await this.classify(thought);
    return this.processCapture(thought, classification, userId);
  }

  private async buildClassifyPrompt(thought: string): Promise<string> {
    if (!this.classifyPrompt) {
      try {
        // Try multiple paths for prompt file (works in both tsx and test environments)
        const candidates = [
          join(__dirname, "..", "prompts", "classify.txt"),
          join(process.cwd(), "src", "prompts", "classify.txt"),
        ];
        let loaded = false;
        for (const candidate of candidates) {
          try {
            const content = await readFile(candidate, "utf-8");
            if (content) {
              this.classifyPrompt = content;
              loaded = true;
              break;
            }
          } catch {
            // Try next candidate
          }
        }
        if (!loaded) {
          throw new Error("Prompt file not found");
        }
      } catch {
        // Fallback inline prompt if file not found
        this.classifyPrompt =
          "Classify this thought into one of: people, projects, ideas, admin. Return ONLY JSON with category, confidence, reasoning, extracted_data.\n\nThought: {{THOUGHT}}";
      }
    }
    // Fallback always sets classifyPrompt; non-null assertion is safe here
    return (this.classifyPrompt as string).replace("{{THOUGHT}}", thought);
  }

  private extractJson(response: string): string {
    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(response);
    if (codeBlockMatch?.[1]) {
      return codeBlockMatch[1].trim();
    }

    // Try to find raw JSON object
    const jsonMatch = /\{[\s\S]*\}/.exec(response);
    if (jsonMatch?.[0]) {
      return jsonMatch[0];
    }

    return response;
  }

  private fallbackClassification(thought: string): Classification {
    return {
      category: "admin",
      confidence: 0,
      reasoning: "parse error — fallback classification",
      extracted_data: { name: "unknown", notes: thought },
    };
  }

  private generateFilename(classification: Classification): string {
    const data = classification.extracted_data as unknown as Record<string, unknown>;
    const name = String(data["name"] ?? "capture");
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

    const now = new Date();
    const datePart = now.toISOString().replace(/[-:T]/g, "").slice(0, 8);
    const timePart = now.toISOString().replace(/[-:T]/g, "").slice(8, 14);

    return `${sanitized}-${datePart}-${timePart}.md`;
  }

  private formatTimestamp(): string {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }

  private flattenExtractedData(data: Record<string, unknown>): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        flat[key] = value;
      } else if (value !== undefined && value !== null) {
        flat[key] = value;
      }
    }
    return flat;
  }

  private async logToInbox(
    thought: string,
    classification: Classification,
    filePath: string,
    userId?: string
  ): Promise<void> {
    const logPath = join(this.dataDir, "_inbox_log.md");
    const filename = filePath.split("/").pop() ?? "";
    const entry = `\n---\n\n**Timestamp:** ${this.formatTimestamp()}\n**User:** ${userId ?? "unknown"}\n**Category:** ${classification.category} (confidence: ${classification.confidence})\n**File:** \`${filename}\`\n**Thought:** ${thought.slice(0, 200)}${thought.length > 200 ? "..." : ""}\n`;

    await appendFile(logPath, entry, "utf-8");
  }

  private async gitCommit(filePath: string, category: string): Promise<void> {
    try {
      // Initialize git if needed
      await this.spawnGit(["rev-parse", "--git-dir"]).catch(async () => {
        await this.spawnGit(["init"]);
      });

      const relativePath = filePath.replace(`${this.dataDir}/`, "");
      await this.spawnGit(["add", relativePath]);
      await this.spawnGit(["commit", "-m", `capture: ${category} - ${relativePath}`]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn({ error: message }, "Git commit failed (non-blocking)");
    }
  }

  private spawnGit(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, { cwd: this.dataDir, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`git ${args[0]} failed: ${stderr}`));
      });
      child.on("error", reject);
    });
  }
}
