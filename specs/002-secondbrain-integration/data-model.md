# Data Model: SecondBrain Integration

**Feature Branch**: `002-secondbrain-integration`
**Date**: 2026-02-07

## Entities

### Category

```typescript
type Category = "people" | "projects" | "ideas" | "admin";

const VALID_CATEGORIES: readonly Category[] = ["people", "projects", "ideas", "admin"] as const;
```

### Classification

The AI-generated result from classifying a thought.

```typescript
interface Classification {
  category: Category;
  confidence: number;          // 0.0–1.0
  extractedData: ExtractedData;
  reasoning: string;
}

// Category-specific extracted fields
type ExtractedData = PeopleData | ProjectsData | IdeasData | AdminData | NeedsReviewData;

interface PeopleData {
  name: string;
  context: string;
  followUps?: string;
  tags?: string[];
}

interface ProjectsData {
  name: string;
  status: "active" | "waiting" | "blocked" | "someday" | "todo";
  nextAction: string;
  notes?: string;
  tags?: string[];
}

interface IdeasData {
  name: string;
  oneLiner: string;
  notes?: string;
  tags?: string[];
}

interface AdminData {
  name: string;
  dueDate?: string;            // ISO date or null
  notes?: string;
}

interface NeedsReviewData {
  originalText: string;
  possibleCategories: Category[];
  reason: string;
}
```

### CaptureResult

Returned after successfully processing a capture.

```typescript
interface CaptureResult {
  filePath: string;
  category: Category;
  confidence: number;
  needsReview: boolean;
  filename: string;
}
```

### ScannedDocument

Parsed from an existing markdown file.

```typescript
interface ScannedDocument {
  filename: string;
  filepath: string;
  category: string;
  content: string;
  frontmatter: Record<string, unknown>;
  created: Date;
  modified: Date;
  title: string;
  status?: string;
  confidence: number;
}
```

### CaptureStats

Statistics about the knowledge base.

```typescript
interface CaptureStats {
  total: number;
  week: number;
  today: number;
  byCategory: Record<string, number>;
  avgConfidence: number;
  needsReview: number;
  actionable: number;
}
```

### WeeklySummary

Data for weekly review generation.

```typescript
interface WeeklySummary {
  totalCaptures: number;
  byCategory: Record<string, number>;
  activeProjects: Array<{ title: string; status?: string; filename: string }>;
  peopleFollowups: Array<{ title: string; followUps?: string; filename: string }>;
  avgConfidence: number;
  needsReviewCount: number;
}
```

### FixResult

Returned after reclassifying a capture.

```typescript
interface FixResult {
  success: boolean;
  oldCategory: string;
  newCategory: string;
  filename: string;
  oldPath: string;
  newPath: string;
  message: string;
}
```

### SecondBrainConfig

Configuration for the SecondBrain subsystem.

```typescript
interface SecondBrainConfig {
  enabled: boolean;
  dataDir: string;
  confidenceThreshold: number;
  gitEnabled: boolean;
  gitAutoCommit: boolean;
  digest: {
    daily: {
      enabled: boolean;
      time: string;          // "07:00" (24h format)
      timezone: string;      // "America/Chicago"
      limit: number;         // Top N actions
    };
    weekly: {
      enabled: boolean;
      day: string;           // "sunday"
      time: string;          // "16:00"
      timezone: string;
    };
  };
}
```

## File Storage Format

### Markdown File with YAML Frontmatter

```markdown
---
category: people
name: Sarah
context: Marketing campaign discussion
created: 2026-02-07 14:30:15
confidence: 0.92
follow_ups: Follow up next week about Q2 launch
---

## Context

Marketing campaign discussion

## Follow Ups

Follow up next week about Q2 launch

## Original Thought

Had a great call with Sarah about Q2 launch. Follow up next week.

## Classification Reasoning

The message mentions a specific person (Sarah) and describes a conversation...
```

### Inbox Log Format (`_inbox_log.md`)

```markdown
---

**Timestamp:** 2026-02-07 14:30:15
**User:** 123456789
**Category:** people (confidence: 0.92)
**File:** `sarah-20260207-143015.md`
**Thought:** Had a great call with Sarah about Q2 launch...
```

## Directory Structure

```
~/.claude-relay/secondbrain/
├── People/
│   └── sarah-20260207-143015.md
├── Projects/
│   └── website-redesign-20260205-100000.md
├── Ideas/
│   └── ai-integration-20260206-120000.md
├── Admin/
│   └── team-meeting-20260207-090000.md
├── _needs_review/
│   └── unclear-20260207-160000.md
└── _inbox_log.md
```

## State Transitions

### Capture Lifecycle

```
User Message → Classification (Claude CLI)
  ├─ confidence >= threshold → Category Directory (People/Projects/Ideas/Admin)
  └─ confidence < threshold → _needs_review/
      └─ /fix <category> → Correct Category Directory
```

### Digest Generation

```
Scheduler Trigger / /digest command
  → ScannerService.scanAllDocuments()
  → SynthesisService.getDailyActions() or getWeeklySummary()
  → DigestService.generateDailyDigest() or generateWeeklyReview()
  → Claude CLI (prompt + data → natural language)
  → Telegram Message
```
