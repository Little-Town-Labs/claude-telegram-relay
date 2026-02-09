/**
 * ScannerService — read and parse markdown files from the SecondBrain data directory.
 */

import { join } from "path";
import { readFile, readdir, stat } from "fs/promises";
import type { Logger } from "pino";

import type { AppConfig, Category, ScannedDocument } from "../types";
import { parseFrontmatter } from "../utils/frontmatter";

const CATEGORY_DIRS: Record<Category, string> = {
  people: "People",
  projects: "Projects",
  ideas: "Ideas",
  admin: "Admin",
};

const DIR_TO_CATEGORY: Record<string, Category> = {
  People: "people",
  Projects: "projects",
  Ideas: "ideas",
  Admin: "admin",
};

export class ScannerService {
  private dataDir: string;
  private log: Logger;

  constructor(config: AppConfig, logger: Logger) {
    this.dataDir = config.secondbrain?.dataDir ?? join(config.relayDir, "secondbrain");
    this.log = logger;
  }

  /**
   * Scan all .md files across all category directories + _needs_review.
   */
  async scanAllDocuments(): Promise<ScannedDocument[]> {
    const allDocs: ScannedDocument[] = [];

    let entries: string[];
    try {
      entries = (await readdir(this.dataDir)) as string[];
    } catch {
      this.log.debug("Data directory not found, returning empty scan");
      return [];
    }

    const targetDirs = [...Object.values(CATEGORY_DIRS), "_needs_review"];
    const dirsToScan = entries.filter((e) => targetDirs.includes(e));

    for (const dirName of dirsToScan) {
      const category = DIR_TO_CATEGORY[dirName] ?? "admin";
      const docs = await this.readMarkdownDir(join(this.dataDir, dirName), category);
      allDocs.push(...docs);
    }

    return allDocs;
  }

  /**
   * Scan .md files from a single category directory.
   */
  async scanCategory(category: Category): Promise<ScannedDocument[]> {
    const dirName = CATEGORY_DIRS[category] ?? "Admin";
    const dirPath = join(this.dataDir, dirName);
    return this.readMarkdownDir(dirPath, category);
  }

  /**
   * Get documents in the _needs_review directory.
   */
  async getNeedsReview(): Promise<ScannedDocument[]> {
    const dirPath = join(this.dataDir, "_needs_review");
    return this.readMarkdownDir(dirPath, "admin");
  }

  /**
   * Get actionable items from all documents.
   * - Projects with active/todo status
   * - People with follow_ups
   * - Admin with due_date or urgency keywords
   * - Ideas are never actionable
   */
  async getActionableItems(): Promise<ScannedDocument[]> {
    const allDocs = await this.scanAllDocuments();
    return allDocs.filter((doc) => this.isActionable(doc));
  }

  /**
   * Filter documents created within the last N days.
   */
  filterByDate(docs: ScannedDocument[], days: number): ScannedDocument[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return docs.filter((d) => d.created.getTime() >= cutoff);
  }

  private async readMarkdownDir(dirPath: string, category: string): Promise<ScannedDocument[]> {
    let files: string[];
    try {
      files = (await readdir(dirPath)) as string[];
    } catch {
      return [];
    }

    const mdFiles = files.filter((f) => f.endsWith(".md"));
    const docs: ScannedDocument[] = [];

    for (const filename of mdFiles) {
      try {
        const filepath = join(dirPath, filename);
        const raw = await readFile(filepath, "utf-8");
        const fileStat = await stat(filepath);
        const parsed = parseFrontmatter(raw);

        const fm = parsed.metadata;
        const createdStr = fm["created"] as string | undefined;
        const created = createdStr ? new Date(createdStr) : new Date(fileStat.mtimeMs);

        docs.push({
          filename,
          filepath,
          category: (fm["category"] as string) ?? category,
          content: parsed.content,
          frontmatter: fm,
          created,
          modified: new Date(fileStat.mtimeMs),
          title: String(fm["name"] ?? filename.replace(/\.md$/, "")),
          status: fm["status"] as string | undefined,
          confidence: Number(fm["confidence"] ?? 0),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn({ filename, error: msg }, "Failed to parse markdown file");
      }
    }

    return docs;
  }

  private isActionable(doc: ScannedDocument): boolean {
    const fm = doc.frontmatter;

    switch (doc.category) {
      case "projects": {
        const status = fm["status"] as string | undefined;
        return status === "active" || status === "todo";
      }
      case "people": {
        return Boolean(fm["follow_ups"]);
      }
      case "admin": {
        if (fm["due_date"]) return true;
        const content = doc.content.toLowerCase();
        return /\b(urgent|asap|deadline|overdue|today|tomorrow)\b/.test(content);
      }
      default:
        return false;
    }
  }
}
