# Research: Modular Service Layer

**Feature**: 001-modular-service-layer
**Date**: 2026-02-06

## R1: child_process.spawn Best Practices for CLI Orchestration

**Decision**: Use `child_process.spawn` with array-form arguments,
`stdio: ["ignore", "pipe", "pipe"]`, and an AbortController-based
timeout mechanism.

**Rationale**: The existing `relay.ts` already uses this pattern
successfully. Array-form arguments prevent shell injection
(Constitution VI). AbortController is the Node.js-native way to
cancel spawned processes, available since Node 16.

**Alternatives considered**:
- `child_process.exec`: Runs in a shell, creating injection risk.
  Rejected per Constitution VI.
- `child_process.execFile`: Similar to spawn but buffers all output.
  Spawn with streaming is preferred for large outputs.
- Third-party libraries (execa): Adds a dependency. Rejected per
  Constitution VII — spawn is sufficient.

## R2: Session Expiry Implementation

**Decision**: Compare `lastActivity` timestamp against configurable
TTL (default 24 hours) at load time. If expired, return a fresh
session state. Add `sessionTtlMs` to the Zod config schema with
default `86400000` (24h in ms).

**Rationale**: Timestamp comparison is simple, deterministic, and
testable. No background timers or cron jobs needed. The expiry
check happens naturally when session state is loaded before each
message.

**Alternatives considered**:
- Background timer that periodically clears sessions: Adds
  complexity with no benefit for a single-user system. Rejected
  per Constitution VII.
- File modification time (`mtime`): Platform-dependent and fragile.
  Rejected.

## R3: Intent Marker Detection Pattern

**Decision**: Use regex pattern matching on Claude's text output:
- `\[REMEMBER:\s*(.+?)\]`
- `\[GOAL:\s*(.+?)(?:\s*\|\s*DEADLINE:\s*(.+?))?\]`
- `\[DONE:\s*(.+?)\]`

Strip matched markers from the response and build confirmation
strings from captured groups.

**Rationale**: Intent markers are injected via the system prompt,
so their format is controlled by us. Simple regex is sufficient
and keeps the detection logic transparent and testable. No NLP
pipeline needed.

**Alternatives considered**:
- JSON-structured output from Claude: Would require changing the
  output format contract with Claude CLI. More fragile if Claude
  doesn't comply exactly. Rejected.
- Separate Claude call for intent classification: Doubles latency.
  Rejected per Constitution V.

## R4: FIFO Message Queue Design

**Decision**: Implement a simple in-memory async queue using a
promise chain. Each incoming message appends to the chain. The
queue processes one message at a time. No external queue library
needed.

**Rationale**: For a single-user relay processing sequential
messages, an in-memory promise chain is the simplest correct
solution. It naturally serializes async operations without locks
or external dependencies.

**Alternatives considered**:
- `p-queue` or `fastq` npm packages: Adds a dependency for a
  trivial use case. Rejected per Constitution VII.
- Node.js worker threads: Overkill for sequential CLI spawns.
  Rejected per Constitution VII/XX.

## R5: Memory Soft Cap Strategy

**Decision**: When injecting context into prompts, take the most
recent 50 facts and 20 active goals (sorted by creation date,
newest first). All entries remain in the JSON file. The cap is
applied only at prompt-building time.

**Rationale**: Keeping all data in storage preserves history.
Applying the cap at prompt-building time means the cap can be
adjusted without data migration. The numbers (50/20) are based
on keeping the memory context well under 2000 tokens.

**Alternatives considered**:
- Token-based cap (count actual tokens): Adds complexity and a
  tokenizer dependency. Rejected per Constitution VII.
- LRU eviction from storage: Loses data permanently. Rejected
  per clarification decision to retain all entries.

## R6: Session Reset Command

**Decision**: Register a grammy command handler for `/new` that
calls `sessionManager.clear()` and replies with a confirmation
message. The handler runs before the general text handler.

**Rationale**: grammy's `bot.command("new", ...)` naturally
intercepts `/new` before `bot.on("message:text", ...)`. This is
the standard grammy pattern for bot commands.

**Alternatives considered**:
- Custom text prefix parsing (e.g., "!new"): Non-standard for
  Telegram bots. Users expect `/command` syntax. Rejected.

## R7: File Persistence Error Handling

**Decision**: All file reads use try/catch with fallback to
default state (empty session, empty memory). All file writes
use atomic write pattern (write to temp file, rename). JSON
parse errors are caught and treated as corrupted files.

**Rationale**: The relay must survive corrupted or missing files
on restart (Constitution XVIII, FR-006). Atomic writes prevent
partial writes from corrupting data on crash.

**Alternatives considered**:
- SQLite for persistence: Adds a native dependency. Rejected
  per Constitution VII for V1. Could be a future enhancement.
- Write-ahead logging: Overkill for single-user JSON files.
  Rejected per Constitution VII/XX.
