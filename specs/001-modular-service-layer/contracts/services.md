# Service Contracts: Modular Service Layer

**Feature**: 001-modular-service-layer
**Date**: 2026-02-06

These contracts define the public interfaces for each service module.
They correspond to the TypeScript interfaces already declared in
`src/types/` and are extended with behavioral contracts not expressible
in type signatures alone.

## ClaudeService

### `call(prompt: string, options?: ClaudeCallOptions): Promise<string>`

Spawns Claude CLI with the given prompt and returns the text response.

**Preconditions**:
- `prompt` is a non-empty string.
- If `options.resume` is true, the caller is responsible for
  providing the session context (the service reads session ID
  from SessionManager).

**Postconditions**:
- Returns the trimmed stdout from Claude CLI on success.
- On CLI failure (non-zero exit code), returns a human-readable
  error string prefixed with "Error: ".
- On timeout, kills the child process and returns
  "Error: Claude CLI timed out after {timeout}ms".
- Never throws. All errors are returned as strings.

**Side effects**:
- Spawns a child process (`child_process.spawn`).
- Logs the call via Pino (prompt preview, duration, exit code).

### `buildPrompt(userMessage: string, memoryContext?: string): string`

Builds an enriched prompt with system instructions, timestamp, and
optional memory context.

**Preconditions**:
- `userMessage` is a non-empty string.

**Postconditions**:
- Returns a formatted prompt string containing system instructions,
  current timestamp, optional memory context, and the user message.

**Side effects**: None (pure function).

### `detectIntents(response: string): { cleaned: string, intents: DetectedIntents, confirmations: string[] }`

Scans Claude's response for intent markers and returns cleaned text.

**Preconditions**:
- `response` is a string (may be empty).

**Postconditions**:
- `cleaned`: Response with all `[REMEMBER:]`, `[GOAL:]`, `[DONE:]`
  markers removed.
- `intents`: Extracted intent data (may all be undefined if no
  markers found).
- `confirmations`: Human-readable confirmation strings for each
  detected intent (e.g., "Noted: I'll remember your birthday is
  March 15"). Empty array if no intents detected.

**Side effects**: None (pure function).

## SessionManager

### `load(): Promise<SessionState>`

Loads session state from the persistence file.

**Postconditions**:
- Returns the persisted SessionState if file exists and is valid.
- Returns `{ sessionId: null, lastActivity: now, messageCount: 0 }`
  if file is missing, empty, or corrupted.
- If `lastActivity + sessionTtlMs < now`, returns fresh state
  (session expired).

**Side effects**: Reads from filesystem. Logs on error/expiry.

### `save(state: SessionState): Promise<void>`

Persists session state to the file.

**Preconditions**:
- `state` conforms to SessionState interface.

**Postconditions**:
- State is written atomically (write temp, rename).

**Side effects**: Writes to filesystem.

### `updateActivity(sessionId: string): Promise<void>`

Updates the session with a new session ID and refreshes the
activity timestamp.

**Postconditions**:
- `sessionId` is updated.
- `lastActivity` is set to current ISO timestamp.
- `messageCount` is incremented by 1.
- State is persisted via `save()`.

### `clear(): Promise<void>`

Resets session to fresh state.

**Postconditions**:
- Session file contains `{ sessionId: null, lastActivity: now, messageCount: 0 }`.

## MemoryService

### `load(): Promise<Memory>`

Loads memory from the persistence file.

**Postconditions**:
- Returns the persisted Memory if file exists and is valid.
- Returns `{ facts: [], goals: [], completedGoals: [] }` if file
  is missing, empty, or corrupted.

**Side effects**: Reads from filesystem. Logs on error.

### `save(memory: Memory): Promise<void>`

Persists memory to the file.

**Postconditions**:
- Memory is written atomically (write temp, rename).

### `addFact(fact: string): Promise<string>`

Adds a fact to the memory store.

**Preconditions**:
- `fact` is a non-empty string.

**Postconditions**:
- Fact is appended to the end of the facts array.
- Returns a confirmation string: `"Remembered: {fact}"`.

**Side effects**: Writes to filesystem via `save()`.

### `addGoal(text: string, deadline?: string): Promise<string>`

Adds a goal to the memory store.

**Preconditions**:
- `text` is a non-empty string.

**Postconditions**:
- Goal is appended with `createdAt` set to current ISO timestamp.
- Returns a confirmation string: `"Goal set: {text}"` or
  `"Goal set: {text} (deadline: {deadline})"`.

### `completeGoal(searchText: string): Promise<string>`

Marks a matching goal as completed.

**Preconditions**:
- `searchText` is a non-empty string.

**Postconditions**:
- Finds the first active goal whose `text` contains `searchText`
  (case-insensitive).
- If found: moves to `completedGoals` with `completedAt` timestamp.
  Returns `"Completed: {goal.text}"`.
- If not found: returns `"No matching goal found for: {searchText}"`.

### `getContext(): Promise<string>`

Returns formatted memory context for prompt injection.

**Postconditions**:
- Returns a string containing up to 50 most recent facts and 20
  most recent active goals, formatted for inclusion in a prompt.
- Returns empty string if no facts or goals exist.

**Format**:
```text
[Memory Context]
Facts: fact1; fact2; fact3; ...
Active Goals:
- goal1 (deadline: ...)
- goal2
```

## MessageQueue

### `enqueue(fn: () => Promise<void>): void`

Adds an async operation to the FIFO queue.

**Postconditions**:
- The function is scheduled to run after all previously enqueued
  functions complete.
- If the queue was empty, execution begins immediately.

**Side effects**: Executes queued functions sequentially.

### `size(): number`

Returns the number of pending (not yet started) items in the queue.

### `isProcessing(): boolean`

Returns true if a queued function is currently executing.
