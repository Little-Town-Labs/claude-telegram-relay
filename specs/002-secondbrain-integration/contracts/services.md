# Service Contracts: SecondBrain Integration

## CaptureService

```typescript
class CaptureService {
  constructor(config: AppConfig, claudeService: ClaudeService, logger: Logger);

  /**
   * Classify a thought using Claude CLI.
   * Returns classification with category, confidence, extracted data.
   * Never throws — returns fallback classification on error.
   */
  classify(thought: string): Promise<Classification>;

  /**
   * Process a classified thought: create markdown file, log to inbox, git commit.
   * Returns capture result with file path and metadata.
   */
  processCapture(
    thought: string,
    classification: Classification,
    userId?: string
  ): Promise<CaptureResult>;

  /**
   * Convenience: classify + processCapture in one call.
   */
  capture(thought: string, userId?: string): Promise<CaptureResult>;
}
```

## ScannerService

```typescript
class ScannerService {
  constructor(config: AppConfig, logger: Logger);

  /**
   * Scan all markdown files across all categories.
   * Returns parsed documents with frontmatter and metadata.
   */
  scanAllDocuments(): Promise<ScannedDocument[]>;

  /**
   * Scan a single category directory.
   */
  scanCategory(category: Category): Promise<ScannedDocument[]>;

  /**
   * Return only actionable items (active projects, people follow-ups, admin tasks).
   */
  getActionableItems(): Promise<ScannedDocument[]>;

  /**
   * Return items in _needs_review/ directory.
   */
  getNeedsReview(): Promise<ScannedDocument[]>;

  /**
   * Filter documents created within last N days.
   */
  filterByDate(docs: ScannedDocument[], days: number): ScannedDocument[];
}
```

## SynthesisService

```typescript
class SynthesisService {
  constructor(scanner: ScannerService, config: AppConfig, logger: Logger);

  /**
   * Get top N prioritized actionable items for daily digest.
   */
  getDailyActions(limit?: number): Promise<ScannedDocument[]>;

  /**
   * Get weekly summary with stats, patterns, and insights.
   */
  getWeeklySummary(): Promise<WeeklySummary>;

  /**
   * Get capture statistics (total, weekly, daily, by category).
   */
  getStats(): Promise<CaptureStats>;

  /**
   * Sort items by priority score (deadlines, recency, status, urgency).
   */
  prioritizeActions(items: ScannedDocument[]): ScannedDocument[];
}
```

## DigestService

```typescript
class DigestService {
  constructor(
    claudeService: ClaudeService,
    synthesis: SynthesisService,
    config: AppConfig,
    logger: Logger
  );

  /**
   * Generate daily digest text via Claude CLI.
   * Gathers actionable items, builds prompt, calls Claude.
   */
  generateDailyDigest(): Promise<string>;

  /**
   * Generate weekly review text via Claude CLI.
   * Gathers weekly summary, builds prompt, calls Claude.
   */
  generateWeeklyReview(): Promise<string>;
}
```

## SchedulerService

```typescript
class SchedulerService {
  constructor(
    digestService: DigestService,
    bot: Bot,
    config: AppConfig,
    logger: Logger
  );

  /**
   * Start scheduled digest triggers.
   * Sets timers for daily and weekly digests based on config.
   */
  start(): void;

  /**
   * Stop all timers. Called on shutdown.
   */
  stop(): void;

  /**
   * Get next scheduled run times for debugging.
   */
  getNextRuns(): Record<string, { name: string; nextRun: string }>;

  /**
   * Manually trigger a digest for testing.
   */
  triggerNow(jobId: "daily" | "weekly"): Promise<void>;
}
```

## FixerService

```typescript
class FixerService {
  constructor(config: AppConfig, logger: Logger);

  /**
   * Reclassify a capture to a different category.
   * Moves file, updates frontmatter, logs fix, git commits.
   */
  fixCapture(
    newCategory: Category,
    filename?: string,
    userId?: string
  ): Promise<FixResult>;
}
```

## Frontmatter Utility

```typescript
// src/utils/frontmatter.ts

interface FrontmatterResult {
  metadata: Record<string, unknown>;
  content: string;
}

/**
 * Parse markdown file content with YAML frontmatter.
 * Splits on --- delimiters, parses flat key-value YAML.
 */
function parseFrontmatter(fileContent: string): FrontmatterResult;

/**
 * Serialize metadata + content into markdown with YAML frontmatter.
 */
function stringifyFrontmatter(
  metadata: Record<string, unknown>,
  content: string
): string;
```

## Telegram Command Contracts

| Command | Input | Output |
|---------|-------|--------|
| `/capture <text>` | Thought text | Confirmation: "Captured as **people** (92% confident) → `sarah-20260207.md`" |
| `/stats` | None | Formatted stats: total, weekly, daily, by category |
| `/review` | None | List of items in `_needs_review/` or "No items need review" |
| `/digest` | None | Daily digest generated via Claude CLI |
| `/digest weekly` | None | Weekly review generated via Claude CLI |
| `/fix <category>` | Category name | "Reclassified from admin to projects" |
| `/fix <filename> <category>` | Filename + category | "Reclassified `file.md` from admin to projects" |
