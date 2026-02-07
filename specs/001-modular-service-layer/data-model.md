# Data Model: Modular Service Layer

**Feature**: 001-modular-service-layer
**Date**: 2026-02-06

## Entities

### SessionState

Represents a conversation session with Claude CLI.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sessionId | string \| null | yes | Claude CLI session ID for `--resume`. Null when no session exists. |
| lastActivity | string (ISO 8601) | yes | Timestamp of last message exchange. Used for expiry calculation. |
| messageCount | number | no | Running count of messages in this session. Default 0. |

**Identity**: Singleton per relay instance. Only one session exists
at a time.

**Lifecycle**:
- Created: First message when no session exists
- Active: Updated on each message (sessionId, lastActivity, messageCount)
- Expired: lastActivity + sessionTtlMs < now → treated as null
- Cleared: User sends `/new` → reset to null state

**Persistence**: `~/.claude-relay/session.json`

### Memory

Represents the user's persistent knowledge store.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| facts | string[] | yes | List of stored facts. Newest appended at end. |
| goals | Goal[] | yes | Active goals. Newest appended at end. |
| completedGoals | CompletedGoal[] | yes | Completed goals. Moved from goals on completion. |

### Goal

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | Goal description. |
| deadline | string | no | Optional deadline in natural language or ISO format. |
| createdAt | string (ISO 8601) | yes | When the goal was created. |

### CompletedGoal

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | Goal description (copied from Goal). |
| completedAt | string (ISO 8601) | yes | When the goal was completed. |

**Identity**: Singleton per relay instance. One memory store
shared across all sessions.

**Lifecycle**:
- Facts: Appended on `[REMEMBER:]` detection. No deletion mechanism
  in V1. Soft cap (50) applied at prompt injection time.
- Goals: Appended on `[GOAL:]` detection. Moved to completedGoals
  on `[DONE:]` detection. Soft cap (20 active) applied at prompt
  injection time.

**Persistence**: `~/.claude-relay/memory.json`

### DetectedIntents

Transient object extracted from Claude's response text. Not persisted.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| remember | string | no | Fact to store, extracted from `[REMEMBER: ...]`. |
| goal | { text, deadline? } | no | Goal to track, extracted from `[GOAL: ... \| DEADLINE: ...]`. |
| done | string | no | Search text to match against active goals, from `[DONE: ...]`. |

### ClaudeCallOptions

Parameters for a single Claude CLI invocation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resume | boolean | no | Whether to use `--resume` with current session ID. |
| imagePath | string | no | Path to image file to include in prompt context. |
| timeout | number | no | Timeout in ms. Default from config (120000). |

### AppConfig Extensions

New fields added to the existing config schema.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| sessionTtlMs | number | no | 86400000 | Session inactivity timeout in milliseconds (24h). |
| memoryFile | string | no | `{relayDir}/memory.json` | Path to memory persistence file. |
| cliTimeoutMs | number | no | 120000 | Default timeout for Claude CLI invocations (2 min). |

## Relationships

```text
AppConfig ──────── configures ──────► ClaudeService
    │                                     │
    ├── configures ──► SessionManager     │ uses
    │                      │              │
    └── configures ──► MemoryService      ▼
                           │         child_process.spawn
                           │
                           └── injects context into ──► buildPrompt()
```

- ClaudeService depends on AppConfig (paths, timeout) and
  SessionManager (session ID for --resume).
- MemoryService depends on AppConfig (file path, soft caps) and
  is consumed by the message handler to enrich prompts and
  process responses.
- SessionManager depends on AppConfig (session file path, TTL).
- All services are independent of each other at the interface
  level — they are composed in `src/index.ts`.

## Validation Rules

- `sessionId`: Must be a valid UUID string or null. Validated on
  load; invalid values treated as null.
- `lastActivity`: Must be a valid ISO 8601 timestamp. Invalid
  values treated as epoch (forces expiry).
- `facts`: Each fact is a non-empty string. Empty strings are
  silently dropped on add.
- `goals.text`: Non-empty string. Empty strings are silently
  dropped on add.
- `goals.deadline`: Optional. No format validation — stored as
  provided by Claude.
- `sessionTtlMs`: Must be positive integer. Validated by Zod schema.
