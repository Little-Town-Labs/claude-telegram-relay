# Feature Specification: Modular Service Layer

**Feature Branch**: `001-modular-service-layer`
**Created**: 2026-02-06
**Status**: Draft
**Input**: Complete Phase 2 migration from monolithic relay.ts to modular index.ts by implementing ClaudeService, SessionManager, and MemoryService

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send Text and Receive Claude Response (Priority: P1)

A user sends a text message to the Telegram bot via the modular
entry point (`src/index.ts`). The system spawns the Claude CLI
with the message, waits for the response, and sends it back to
the user in Telegram. The experience is identical to what
`src/relay.ts` provides today, but the underlying code is modular
and testable.

**Why this priority**: This is the core value proposition of the
relay. Without a working ClaudeService, the modular entry point is
non-functional — it currently echoes messages back instead of
calling Claude.

**Independent Test**: Send a text message to the bot running via
`npm run start` and verify a Claude-generated response is returned.

**Acceptance Scenarios**:

1. **Given** the bot is running via `src/index.ts`, **When** the
   authorized user sends a text message, **Then** the system
   spawns Claude CLI with the message and returns the CLI output
   as a Telegram reply.
2. **Given** the bot is running via `src/index.ts`, **When** the
   authorized user sends a text message, **Then** a typing
   indicator appears within 3 seconds of message receipt.
3. **Given** Claude CLI produces a response longer than 4000
   characters, **When** the response is returned, **Then** the
   system splits it into multiple Telegram messages at natural
   boundaries (paragraph, line, word).
4. **Given** Claude CLI fails or times out, **When** the error
   occurs, **Then** the user receives a human-readable error
   message (not a stack trace or exit code).

---

### User Story 2 - Conversation Continuity Across Messages (Priority: P2)

A user sends multiple messages over time and expects Claude to
remember prior context. The system persists session IDs between
messages so that subsequent calls to Claude CLI include `--resume`
with the session ID from the previous interaction.

**Why this priority**: Session continuity is what makes the relay
feel like a conversation rather than isolated prompts. It builds
directly on the ClaudeService from User Story 1.

**Independent Test**: Send two messages in sequence. The second
message references something from the first. Verify Claude's
response demonstrates awareness of the prior exchange.

**Acceptance Scenarios**:

1. **Given** a new session with no prior messages, **When** the
   user sends a message, **Then** the system calls Claude without
   `--resume` and stores the resulting session ID.
2. **Given** a session ID exists from a prior message, **When**
   the user sends another message, **Then** the system calls
   Claude with `--resume <sessionId>`.
3. **Given** session state is persisted to a file, **When** the
   relay restarts, **Then** session state is recovered from the
   file and conversation continuity is maintained.
4. **Given** the session file is corrupted or missing, **When**
   the relay starts, **Then** the system creates a fresh session
   without crashing.
5. **Given** the last message was sent more than the configured
   inactivity period ago (default 24 hours), **When** the user
   sends a new message, **Then** the system starts a fresh
   session instead of resuming the expired one.
6. **Given** the user sends a reset command (e.g., `/new`),
   **When** the command is received, **Then** the current session
   is cleared and the next message starts a fresh conversation.

---

### User Story 3 - Persistent Memory for Facts and Goals (Priority: P3)

A user tells Claude to remember facts ("my birthday is March 15")
or set goals ("finish the report by Friday"). The system detects
these intents in Claude's response and persists them. On
subsequent messages, persisted facts and goals are injected into
the prompt context so Claude can reference them.

**Why this priority**: Memory transforms the relay from a stateless
tool into a personal assistant. It depends on ClaudeService (US1)
and benefits from SessionManager (US2) but can be tested
independently.

**Independent Test**: Tell the bot to remember a fact, start a new
session, and ask about the fact. Verify Claude's response includes
the stored information.

**Acceptance Scenarios**:

1. **Given** Claude's response contains a `[REMEMBER: fact]`
   marker, **When** the response is processed, **Then** the fact
   is persisted in the memory store.
2. **Given** Claude's response contains a `[GOAL: text]` marker,
   **When** the response is processed, **Then** the goal is
   persisted with a creation timestamp.
3. **Given** persisted facts and goals exist, **When** the user
   sends a new message, **Then** the system injects a memory
   context block into the prompt before sending it to Claude.
4. **Given** Claude's response contains a `[DONE: search text]`
   marker, **When** the response is processed, **Then** the
   matching goal is moved from active to completed.
5. **Given** the memory file is corrupted or missing, **When** the
   relay starts, **Then** the system creates empty memory without
   crashing.

---

### User Story 4 - Media Message Handling via Modular Architecture (Priority: P4)

A user sends a photo, voice message, or document through Telegram.
The modular entry point handles these message types using the
ClaudeService, matching the behavior of the original `relay.ts`.

**Why this priority**: Media handling is important for feature
parity but depends on a working ClaudeService. Voice messages
additionally require external transcription services, making this
lower priority for initial delivery.

**Independent Test**: Send an image with a caption to the bot
running via `npm run start`. Verify Claude analyzes the image and
responds.

**Acceptance Scenarios**:

1. **Given** the user sends a photo with a caption, **When** the
   photo is processed, **Then** the system downloads the image,
   passes the file path to Claude CLI, and returns the analysis.
2. **Given** the user sends a document, **When** the document is
   processed, **Then** the system downloads it, passes the file
   path to Claude CLI, and returns the analysis.
3. **Given** the user sends a voice message and a transcription
   service is configured, **When** the voice is processed,
   **Then** the system transcribes the audio and sends the
   transcript to Claude.
4. **Given** no transcription service is configured, **When** the
   user sends a voice message, **Then** the system replies with a
   helpful message explaining that voice requires a transcription
   service.
5. **Given** a file download fails, **When** the error occurs,
   **Then** the user receives a clear error message and no
   temporary files are left behind.

---

### Edge Cases

- What happens when Claude CLI is not installed or not in PATH?
  The system MUST detect this at startup and exit with a clear
  error message.
- What happens when two messages arrive simultaneously? The system
  MUST use a FIFO queue to process messages in arrival order. While
  Claude CLI is busy processing one message, subsequent messages
  are queued and processed sequentially. Each queued message
  receives a typing indicator while waiting.
- What happens when the relay runs out of disk space for uploads?
  File operations MUST fail gracefully with a user-facing error.
- What happens when the session file is locked by another process?
  The system MUST retry or report the issue, not crash.
- What happens when Claude CLI produces output with characters
  that are invalid in Telegram's message format? The system MUST
  sanitize or escape the output before sending.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The modular entry point (`src/index.ts`) MUST call
  Claude CLI for text messages instead of echoing them back.
- **FR-002**: A `ClaudeService` module MUST encapsulate all
  Claude CLI spawn logic (process creation, argument building,
  stdout/stderr collection, exit code handling).
- **FR-003**: ClaudeService MUST accept prompt text and options
  (resume flag, image path, timeout) and return the CLI response
  as a string.
- **FR-004**: The message handler in `src/index.ts` MUST send a
  typing indicator before calling ClaudeService. ClaudeService
  itself does not interact with the Telegram API.
- **FR-005**: A `SessionManager` module MUST persist and retrieve
  session state (session ID, last activity timestamp, message
  count) across relay restarts.
- **FR-006**: SessionManager MUST handle missing, empty, or
  corrupted persistence files without crashing.
- **FR-006a**: SessionManager MUST auto-expire sessions after a
  configurable inactivity period (default 24 hours). An expired
  session is treated as if no session exists.
- **FR-006b**: The system MUST support a user-initiated reset
  command (e.g., `/new`) that clears the current session and
  starts a fresh conversation.
- **FR-007**: A `MemoryService` module MUST persist and retrieve
  facts and goals from local file storage.
- **FR-008**: Intent markers (`[REMEMBER: ...]`, `[GOAL: ...]`,
  `[DONE: ...]`) MUST be detected and processed in two stages:
  (a) `ClaudeService.detectIntents()` scans Claude's response text,
  extracts marker data, strips markers, and returns confirmation
  strings; (b) the message handler calls MemoryService methods
  (`addFact`, `addGoal`, `completeGoal`) to persist the extracted
  data. The cleaned response (markers removed) with appended
  confirmations (e.g., "Noted: I'll remember your birthday is
  March 15") is sent to the user.
- **FR-009**: MemoryService MUST inject stored context (facts,
  active goals) into prompts sent to Claude. A soft cap applies:
  the most recent 50 facts and 20 active goals are included in
  prompt injection. Older entries are retained in storage but
  excluded from the prompt context.
- **FR-010**: The modular entry point MUST handle photo, document,
  and voice message types with the same behavior as `relay.ts`.
- **FR-011**: All services MUST log operations through Pino
  structured logging (not `console.log`).
- **FR-012**: All services MUST implement the TypeScript
  interfaces already defined in `src/types/`.
- **FR-013**: The original `src/relay.ts` MUST remain functional
  and unmodified — both entry points coexist.

### Key Entities

- **SessionState**: Represents a conversation session with Claude.
  Key attributes: session ID (nullable), last activity timestamp,
  message count.
- **Memory**: Represents the user's persistent knowledge store.
  Key attributes: list of facts, list of active goals (with
  optional deadlines), list of completed goals.
- **ClaudeCallOptions**: Represents parameters for a single CLI
  invocation. Key attributes: resume flag, image path, timeout.
- **DetectedIntents**: Represents intent markers extracted from
  Claude's response. Key attributes: remember fact, new goal,
  completed goal reference.

### Assumptions

- Local file storage (JSON files) is sufficient for session and
  memory persistence in the initial implementation. Cloud storage
  (Supabase) is a future enhancement.
- The Claude CLI is installed and authenticated on the host system.
  The relay does not manage CLI installation or authentication.
- Intent markers (`[REMEMBER: ...]`, `[GOAL: ...]`, `[DONE: ...]`)
  are injected by the system prompt sent to Claude, not by a
  separate NLP pipeline. The detection logic uses pattern matching
  on Claude's text output.
- Voice transcription depends on an external service (configured
  via environment variables). If not configured, voice messages
  are gracefully declined.

## Clarifications

### Session 2026-02-06

- Q: When should a session expire, and can the user manually reset? → A: Both — auto-expire after configurable inactivity period (default 24h) plus user-triggered reset via command.
- Q: Should intent markers ([REMEMBER:], [GOAL:], [DONE:]) be visible to the user? → A: Strip markers from response; append brief confirmation (e.g., "Noted: I'll remember...").
- Q: How should concurrent messages be handled when Claude CLI is busy? → A: FIFO queue — process all messages in arrival order.
- Q: Should there be limits on memory store growth for prompt injection? → A: Soft cap (50 facts, 20 active goals) — oldest excluded from prompt but retained in storage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can send a text message via `npm run start`
  and receive a Claude-generated response, matching the behavior
  of `npm run relay`.
- **SC-002**: All new service modules achieve 80% or higher line
  test coverage as measured by vitest.
- **SC-003**: The relay restarts cleanly after an ungraceful
  shutdown, recovering session state without user intervention.
- **SC-004**: Conversation continuity works across relay restarts
  — a user can reference prior messages after the relay is
  restarted.
- **SC-005**: Memory facts persist across sessions — a fact
  stored in one session is available in subsequent sessions.
- **SC-006**: The original `relay.ts` entry point continues to
  work without modification after the modular implementation is
  complete.
- **SC-007**: Response time for the modular path is within 500ms
  of the monolithic path for equivalent operations (excluding
  Claude CLI processing time).
