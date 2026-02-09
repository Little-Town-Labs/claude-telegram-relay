/**
 * FixerService — reclassify captures by moving files between category directories.
 */

import { join } from "path";
import { appendFile, mkdir, readFile, readdir, unlink, writeFile } from "fs/promises";
import type { Logger } from "pino";

import type { AppConfig, Category, FixResult } from "../types";
import { VALID_CATEGORIES } from "../types";
import { parseFrontmatter, stringifyFrontmatter } from "../utils/frontmatter";

const CATEGORY_DIRS: Record<Category, string> = {
  people: "People",
  projects: "Projects",
  ideas: "Ideas",
  admin: "Admin",
};

export class FixerService {
  private dataDir: string;
  private log: Logger;

  constructor(config: AppConfig, logger: Logger) {
    this.dataDir = config.secondbrain?.dataDir ?? join(config.relayDir, "secondbrain");
    this.log = logger;
  }

  /**
   * Fix a capture's classification by moving it to a new category directory.
   */
  async fixCapture(newCategory: string, filename: string, userId?: string): Promise<FixResult> {
    // Validate category
    if (!VALID_CATEGORIES.includes(newCategory as Category)) {
      return {
        success: false,
        oldCategory: "",
        newCategory,
        filename,
        oldPath: "",
        newPath: "",
        message: `Invalid category: "${newCategory}". Valid: ${VALID_CATEGORIES.join(", ")}`,
      };
    }

    const category = newCategory as Category;

    // Find the file
    const filePath = await this.findFileByName(filename);
    if (!filePath) {
      return {
        success: false,
        oldCategory: "",
        newCategory: category,
        filename,
        oldPath: "",
        newPath: "",
        message: `File "${filename}" not found in any category directory.`,
      };
    }

    try {
      // Read and parse existing file
      const raw = await readFile(filePath, "utf-8");
      const parsed = parseFrontmatter(raw);
      const oldCategory = String(parsed.metadata["category"] ?? "admin");

      // Update frontmatter
      parsed.metadata["category"] = category;
      const newContent = stringifyFrontmatter(parsed.metadata, parsed.content);

      // Write to new location
      const newDir = join(this.dataDir, CATEGORY_DIRS[category]);
      await mkdir(newDir, { recursive: true });
      const newPath = join(newDir, filename);
      await writeFile(newPath, newContent, "utf-8");

      // Remove from old location (if different path)
      if (filePath !== newPath) {
        await unlink(filePath);
      }

      // Log the fix
      await this.logFix(filename, oldCategory, category, userId);

      this.log.info({ filename, oldCategory, newCategory: category }, "Capture reclassified");

      return {
        success: true,
        oldCategory,
        newCategory: category,
        filename,
        oldPath: filePath,
        newPath,
        message: `Moved "${filename}" from ${oldCategory} to ${category}.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error({ error: msg, filename }, "Failed to fix capture");
      return {
        success: false,
        oldCategory: "",
        newCategory: category,
        filename,
        oldPath: filePath,
        newPath: "",
        message: `Error fixing capture: ${msg}`,
      };
    }
  }

  /**
   * Search all category directories for a file by name.
   */
  async findFileByName(filename: string): Promise<string | null> {
    const dirs = [...Object.values(CATEGORY_DIRS), "_needs_review"];

    for (const dirName of dirs) {
      const dirPath = join(this.dataDir, dirName);
      try {
        const files = (await readdir(dirPath)) as string[];
        if (files.includes(filename)) {
          return join(dirPath, filename);
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return null;
  }

  /**
   * Parse the inbox log to find the last file captured by a given user.
   */
  async findLastUserFile(userId: string): Promise<string | null> {
    try {
      const logPath = join(this.dataDir, "_inbox_log.md");
      const content = await readFile(logPath, "utf-8");

      // Find all entries for this user, return the last file
      const pattern = `\\*\\*User:\\*\\* ${userId}[\\s\\S]*?\\*\\*File:\\*\\* \`([^\`]+)\``;
      const regex = new RegExp(pattern, "g");

      let lastFilename: string | null = null;
      let match = regex.exec(content);
      while (match) {
        lastFilename = match[1] ?? null;
        match = regex.exec(content);
      }

      return lastFilename;
    } catch {
      return null;
    }
  }

  private async logFix(
    filename: string,
    oldCategory: string,
    newCategory: string,
    userId?: string
  ): Promise<void> {
    const logPath = join(this.dataDir, "_inbox_log.md");
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const entry = `\n---\n\n**Timestamp:** ${timestamp}\n**User:** ${userId ?? "unknown"}\n**Action:** Fix\n**File:** \`${filename}\`\n**Change:** ${oldCategory} → ${newCategory}\n`;

    await appendFile(logPath, entry, "utf-8");
  }
}
