/**
 * MemoryService - Persistent facts and goals
 *
 * Manages memory state for cross-session context.
 * Supports facts, goals with deadlines, and goal completion.
 */

import { readFile, rename, writeFile } from "fs/promises";
import type { Logger } from "pino";
import type { Memory } from "../types";

export class MemoryService {
  private memoryFile: string;
  private log: Logger;

  constructor(memoryFile: string, logger: Logger) {
    this.memoryFile = memoryFile;
    this.log = logger;
  }

  /**
   * Load memory from persistence file.
   * Returns empty memory if file is missing, corrupted, or unreadable.
   */
  async load(): Promise<Memory> {
    try {
      const data = await readFile(this.memoryFile, "utf-8");
      return JSON.parse(data) as Memory;
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      if (err?.["code"] === "ENOENT") {
        this.log.debug("No memory file found, starting empty");
      } else {
        this.log.warn({ error: err?.["message"] }, "Failed to load memory");
      }
      return this.emptyMemory();
    }
  }

  /**
   * Persist memory atomically (write temp, rename).
   */
  async save(memory: Memory): Promise<void> {
    const tmpFile = `${this.memoryFile}.tmp`;
    await writeFile(tmpFile, JSON.stringify(memory, null, 2));
    await rename(tmpFile, this.memoryFile);
  }

  /**
   * Add a fact to memory. Drops empty/whitespace strings.
   */
  async addFact(fact: string): Promise<string> {
    if (!fact.trim()) return "";

    const memory = await this.load();
    memory.facts.push(fact);
    await this.save(memory);
    this.log.info({ fact }, "Fact added");
    return `Remembered: ${fact}`;
  }

  /**
   * Add a goal with optional deadline.
   */
  async addGoal(text: string, deadline?: string): Promise<string> {
    if (!text.trim()) return "";

    const memory = await this.load();
    memory.goals.push({
      text,
      deadline,
      createdAt: new Date().toISOString(),
    });
    await this.save(memory);
    this.log.info({ text, deadline }, "Goal added");

    if (deadline) {
      return `Goal set: ${text} (deadline: ${deadline})`;
    }
    return `Goal set: ${text}`;
  }

  /**
   * Complete a goal by case-insensitive search text match.
   */
  async completeGoal(searchText: string): Promise<string> {
    const memory = await this.load();
    const lowerSearch = searchText.toLowerCase();
    const index = memory.goals.findIndex((g) => g.text.toLowerCase().includes(lowerSearch));

    if (index === -1) {
      return `No matching goal found for: ${searchText}`;
    }

    const removed = memory.goals.splice(index, 1);
    const goal = removed[0];
    if (!goal) {
      return `No matching goal found for: ${searchText}`;
    }
    memory.completedGoals.push({
      text: goal.text,
      completedAt: new Date().toISOString(),
    });
    await this.save(memory);
    this.log.info({ goal: goal.text }, "Goal completed");
    return `Completed: ${goal.text}`;
  }

  /**
   * Get formatted memory context for prompt injection.
   * Applies soft cap: 50 most recent facts, 20 most recent goals.
   */
  async getContext(): Promise<string> {
    const memory = await this.load();

    const facts = memory.facts.slice(-50);
    const goals = memory.goals.slice(-20);

    if (facts.length === 0 && goals.length === 0) {
      return "";
    }

    const parts: string[] = ["[Memory Context]"];

    if (facts.length > 0) {
      parts.push(`Facts: ${facts.join("; ")}`);
    }

    if (goals.length > 0) {
      parts.push("Active Goals:");
      for (const goal of goals) {
        if (goal.deadline) {
          parts.push(`- ${goal.text} (deadline: ${goal.deadline})`);
        } else {
          parts.push(`- ${goal.text}`);
        }
      }
    }

    return parts.join("\n");
  }

  private emptyMemory(): Memory {
    return {
      facts: [],
      goals: [],
      completedGoals: [],
    };
  }
}
