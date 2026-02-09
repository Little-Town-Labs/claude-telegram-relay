/**
 * ClaudeService - CLI spawn orchestration
 *
 * Spawns Claude CLI as a child process, collects output,
 * and handles timeouts and errors.
 */

import { spawn } from "child_process";
import type { Logger } from "pino";
import type { AppConfig, ClaudeCallOptions, DetectedIntents } from "../types";

const REMEMBER_PATTERN = /\[REMEMBER:\s*(.+?)\]/g;
const GOAL_PATTERN = /\[GOAL:\s*(.+?)(?:\s*\|\s*DEADLINE:\s*(.+?))?\]/g;
const DONE_PATTERN = /\[DONE:\s*(.+?)\]/g;

export class ClaudeService {
  private config: AppConfig;
  private log: Logger;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.log = logger;
  }

  /**
   * Spawn Claude CLI with the given prompt and return the text response.
   * Never throws — all errors are returned as strings.
   */
  async call(prompt: string, options?: ClaudeCallOptions): Promise<string> {
    const timeout = options?.timeout ?? this.config.cliTimeoutMs;
    const startTime = Date.now();

    const args = ["--print", prompt];

    if (this.config.claudeModel) {
      args.push("--model", this.config.claudeModel);
    }

    if (options?.imagePath) {
      args.push("--image", options.imagePath);
    }

    this.log.debug({ promptPreview: prompt.substring(0, 80), timeout }, "Spawning Claude CLI");

    return new Promise<string>((resolve) => {
      const ac = new AbortController();
      const timer = setTimeout(() => {
        ac.abort();
      }, timeout);

      const child = spawn(this.config.claudePath, args, {
        signal: ac.signal,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        this.log.info({ exitCode: code, duration }, "Claude CLI completed");

        if (code === 0) {
          resolve(stdout.trim());
        } else {
          this.log.error({ exitCode: code, stderr }, "Claude CLI failed");
          resolve(`Error: Claude CLI exited with code ${code}`);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        if (err.name === "AbortError" || ac.signal.aborted) {
          this.log.warn({ timeout, duration }, "Claude CLI timed out");
          resolve(`Error: Claude CLI timed out after ${timeout}ms`);
        } else {
          this.log.error({ error: err.message }, "Claude CLI spawn error");
          resolve(`Error: ${err.message}`);
        }
      });
    });
  }

  /**
   * Build an enriched prompt with system instructions, timestamp, and
   * optional memory context.
   */
  buildPrompt(userMessage: string, memoryContext?: string): string {
    const timestamp = new Date().toISOString();

    let prompt = `You are a helpful AI assistant responding via Telegram. Keep responses concise and clear.

When the user asks you to remember something, include [REMEMBER: fact] in your response.
When the user sets a goal, include [GOAL: description] or [GOAL: description | DEADLINE: date] in your response.
When the user completes a goal, include [DONE: goal description] in your response.

Current time: ${timestamp}`;

    if (memoryContext) {
      prompt += `\n\n${memoryContext}`;
    }

    prompt += `\n\nUser: ${userMessage}`;

    return prompt;
  }

  /**
   * Scan Claude's response for intent markers and return cleaned text.
   * Pure function — no side effects.
   */
  detectIntents(response: string): {
    cleaned: string;
    intents: DetectedIntents;
    confirmations: string[];
  } {
    const intents: DetectedIntents = {};
    const confirmations: string[] = [];

    // Extract REMEMBER markers
    const rememberMatch = REMEMBER_PATTERN.exec(response);
    if (rememberMatch?.[1]) {
      intents.remember = rememberMatch[1].trim();
      confirmations.push(`Remembered: ${intents.remember}`);
    }
    REMEMBER_PATTERN.lastIndex = 0;

    // Extract GOAL markers
    const goalMatch = GOAL_PATTERN.exec(response);
    if (goalMatch?.[1]) {
      const text = goalMatch[1].trim();
      const deadline = goalMatch[2]?.trim();
      intents.goal = { text, deadline };
      if (deadline) {
        confirmations.push(`Goal set: ${text} (deadline: ${deadline})`);
      } else {
        confirmations.push(`Goal set: ${text}`);
      }
    }
    GOAL_PATTERN.lastIndex = 0;

    // Extract DONE markers
    const doneMatch = DONE_PATTERN.exec(response);
    if (doneMatch?.[1]) {
      intents.done = doneMatch[1].trim();
      confirmations.push(`Completed: ${intents.done}`);
    }
    DONE_PATTERN.lastIndex = 0;

    // Strip all markers from response
    const cleaned = response
      .replace(REMEMBER_PATTERN, "")
      .replace(GOAL_PATTERN, "")
      .replace(DONE_PATTERN, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Reset lastIndex after replace calls
    REMEMBER_PATTERN.lastIndex = 0;
    GOAL_PATTERN.lastIndex = 0;
    DONE_PATTERN.lastIndex = 0;

    return { cleaned, intents, confirmations };
  }
}
