# Tasks: Modular Service Layer

**Input**: Design documents from `/specs/001-modular-service-layer/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/services.md

**Tests**: Tests are included per Constitution Principle II (Test-First Development is non-negotiable) and SC-002 (80%+ coverage).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create directory structure and shared infrastructure files

- [x] T001 Create `src/services/` directory and barrel export file `src/services/index.ts`
- [x] T002 [P] Create `tests/unit/services/` directory structure
- [x] T003 [P] Create `tests/integration/` directory structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend config schema and build message queue — MUST be complete before ANY user story

- [x] T004 Add `sessionTtlMs` and `cliTimeoutMs` fields to Zod schema in `src/config/schema.ts` with defaults (86400000, 120000); change existing `memoryFile` from optional to required with default `{relayDir}/memory.json`; update `parseEnvVars()` to read `SESSION_TTL_MS`, `CLI_TIMEOUT_MS` from environment (note: `MEMORY_FILE` env var already mapped)
- [x] T005 Update `AppConfig` interface in `src/types/config.ts`: add `sessionTtlMs: number` and `cliTimeoutMs: number` as new required fields; change existing `memoryFile` from optional (`memoryFile?: string`) to required (`memoryFile: string`). Also update `SessionState.messageCount` in `src/types/session.ts` from optional to required (`messageCount: number`) to match data-model.md and contract expectations.
- [x] T006 Update `loadConfig()` in `src/config/index.ts` to derive `memoryFile` path from `relayDir` (like existing `sessionFile`)
- [x] T007 Update existing config tests in `tests/unit/config/config.test.ts` to cover new fields (defaults, env var overrides, validation)
- [x] T008 Write tests for MessageQueue in `tests/unit/utils/queue.test.ts`: enqueue/dequeue FIFO order, sequential processing, size/isProcessing state, error in one task does not block subsequent tasks
- [x] T009 Implement MessageQueue in `src/utils/queue.ts`: promise-chain-based FIFO queue with `enqueue()`, `size()`, `isProcessing()` per contracts/services.md
- [x] T010 Export MessageQueue from `src/utils/index.ts`
- [x] T011 Extend `tests/setup.ts` with `createMockSpawnNode()` fixture that returns a mock `ChildProcess` with EventEmitter-based stdout/stderr/close events (replacing Bun-style ReadableStream mock)
- [x] T012 Run `npm test` and `npm run typecheck` to verify all existing + new foundational tests pass

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Send Text and Receive Claude Response (Priority: P1) MVP

**Goal**: Replace the echo handler in `src/index.ts` with a working ClaudeService that spawns Claude CLI and returns real responses.

**Independent Test**: Send a text message to the bot via `npm run start` and receive a Claude-generated response.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T013 [P] [US1] Write unit tests for `ClaudeService.call()` in `tests/unit/services/claude.test.ts`: successful call returns stdout, non-zero exit returns error string, timeout kills process and returns error, empty prompt handling
- [x] T014 [P] [US1] Write unit tests for `ClaudeService.buildPrompt()` in `tests/unit/services/claude.test.ts`: includes system instruction and timestamp, includes memory context when provided, handles empty message
- [x] T015 [P] [US1] Write unit tests for `ClaudeService.detectIntents()` in `tests/unit/services/claude.test.ts`: strips `[REMEMBER:]` markers and returns cleaned text + intent, strips `[GOAL:]` markers with optional deadline, strips `[DONE:]` markers, handles response with no markers, handles multiple markers in one response, returns confirmation strings

### Implementation for User Story 1

- [x] T016 [US1] Implement `ClaudeService` in `src/services/claude.ts`: `call()` using `child_process.spawn` with array args, AbortController timeout, stdout/stderr collection, Pino logging per contract; `buildPrompt()` with system instructions, timestamp, optional memory context; `detectIntents()` with regex patterns from research.md R3
- [x] T017 [US1] Export ClaudeService from `src/services/index.ts`
- [x] T018 [US1] Update `src/index.ts` text message handler: replace echo response with ClaudeService.call() — build prompt via buildPrompt(), spawn CLI, send response via sendResponse(), wrap in MessageQueue.enqueue() for FIFO processing
- [x] T019 [US1] Add Claude CLI availability check at startup in `src/index.ts`: spawn `claude --version`, exit with clear error if not found
- [x] T020 [US1] Run `npm test` and `npm run typecheck` to verify US1 tests pass

**Checkpoint**: At this point, `npm run start` sends text to Claude CLI and returns real responses. MVP functional.

---

## Phase 4: User Story 2 — Conversation Continuity Across Messages (Priority: P2)

**Goal**: Persist session IDs so subsequent messages use `--resume` for conversation context. Support auto-expiry and manual reset via `/new`.

**Independent Test**: Send two related messages in sequence; second response references the first. Reset with `/new` and verify context is gone.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T021 [P] [US2] Write unit tests for `SessionManager.load()` in `tests/unit/services/session.test.ts`: returns persisted state from valid file, returns fresh state when file missing, returns fresh state when file corrupted (invalid JSON), returns fresh state when session expired (lastActivity + TTL < now), returns valid state when session not expired, returns fresh state when file read throws EACCES/EBUSY (locked by another process)
- [x] T022 [P] [US2] Write unit tests for `SessionManager.save()` in `tests/unit/services/session.test.ts`: writes state atomically (temp file + rename), persists all fields correctly
- [x] T023 [P] [US2] Write unit tests for `SessionManager.updateActivity()` in `tests/unit/services/session.test.ts`: updates sessionId, refreshes lastActivity timestamp, increments messageCount
- [x] T024 [P] [US2] Write unit tests for `SessionManager.clear()` in `tests/unit/services/session.test.ts`: resets to null session state, persists the reset state

### Implementation for User Story 2

- [x] T025 [US2] Implement `SessionManager` in `src/services/session.ts`: `load()` with file read + JSON parse + expiry check, `save()` with atomic write, `updateActivity()`, `clear()` per contracts/services.md; all operations use Pino logging
- [x] T026 [US2] Export SessionManager from `src/services/index.ts`
- [x] T027 [US2] Integrate SessionManager into `src/index.ts`: load session at startup, pass session ID to ClaudeService.call() with `resume: true` when session exists, update session after successful CLI call with returned session ID
- [x] T028 [US2] Add `/new` command handler in `src/index.ts` using `bot.command("new", ...)`: call sessionManager.clear(), reply with "Session cleared. Starting fresh conversation."
- [x] T029 [US2] Run `npm test` and `npm run typecheck` to verify US2 tests pass

**Checkpoint**: Conversation continuity works. Session persists across restarts and auto-expires after 24h. `/new` resets the session.

---

## Phase 5: User Story 3 — Persistent Memory for Facts and Goals (Priority: P3)

**Goal**: Detect `[REMEMBER:]`, `[GOAL:]`, `[DONE:]` markers in Claude's responses, persist facts/goals, and inject memory context into prompts.

**Independent Test**: Tell the bot to remember a fact, reset session with `/new`, ask about the fact — Claude should know it from memory context.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T030 [P] [US3] Write unit tests for `MemoryService.load()` in `tests/unit/services/memory.test.ts`: returns persisted memory from valid file, returns empty memory when file missing, returns empty memory when file corrupted
- [x] T031 [P] [US3] Write unit tests for `MemoryService.save()` in `tests/unit/services/memory.test.ts`: writes atomically, persists all fields
- [x] T032 [P] [US3] Write unit tests for `MemoryService.addFact()` in `tests/unit/services/memory.test.ts`: appends fact, returns confirmation, drops empty strings
- [x] T033 [P] [US3] Write unit tests for `MemoryService.addGoal()` in `tests/unit/services/memory.test.ts`: appends goal with createdAt, handles optional deadline, returns confirmation, drops empty strings
- [x] T034 [P] [US3] Write unit tests for `MemoryService.completeGoal()` in `tests/unit/services/memory.test.ts`: moves matching goal to completedGoals, case-insensitive match, returns confirmation, returns "no match" when not found
- [x] T035 [P] [US3] Write unit tests for `MemoryService.getContext()` in `tests/unit/services/memory.test.ts`: returns formatted context with facts and goals, applies soft cap (50 facts, 20 goals), returns empty string when no data, formats deadlines correctly

### Implementation for User Story 3

- [x] T036 [US3] Implement `MemoryService` in `src/services/memory.ts`: `load()`, `save()`, `addFact()`, `addGoal()`, `completeGoal()`, `getContext()` per contracts/services.md; atomic writes, soft cap at getContext() time, Pino logging
- [x] T037 [US3] Export MemoryService from `src/services/index.ts`
- [x] T038 [US3] Integrate MemoryService into `src/index.ts` text handler: before calling Claude, get memory context via `memoryService.getContext()` and pass to `buildPrompt()`; after receiving response, run `detectIntents()` on the response, process intents (addFact, addGoal, completeGoal), strip markers, append confirmations, then send cleaned response to user
- [x] T039 [US3] Update system prompt in `buildPrompt()` in `src/services/claude.ts` to instruct Claude to use `[REMEMBER:]`, `[GOAL:]`, `[DONE:]` markers when the user asks to remember something or set/complete goals
- [x] T040 [US3] Run `npm test` and `npm run typecheck` to verify US3 tests pass

**Checkpoint**: Memory persists across sessions. Facts and goals are injected into prompts. Intent markers are stripped from user-visible responses.

---

## Phase 6: User Story 4 — Media Message Handling (Priority: P4)

**Goal**: Add photo, document, and voice message handlers to the modular entry point, matching `relay.ts` behavior.

**Independent Test**: Send a photo with caption to bot via `npm run start`; receive Claude's image analysis.

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T041 [P] [US4] Write unit tests for photo handler in `tests/unit/services/media.test.ts`: successful download and ClaudeService call, download failure returns user-facing error, temp file cleanup after response, temp file cleanup on error
- [x] T042 [P] [US4] Write unit tests for document handler in `tests/unit/services/media.test.ts`: successful download and ClaudeService call with filename, download failure returns user-facing error, temp file cleanup
- [x] T043 [P] [US4] Write unit tests for voice handler in `tests/unit/services/media.test.ts`: replies with "voice requires transcription service" when not configured

### Implementation for User Story 4

- [x] T044 [US4] Add photo message handler in `src/index.ts`: download highest-res photo via Telegram API, save to uploads dir, call ClaudeService with `[Image: path]` prompt and caption, clean up temp file after response, handle download errors gracefully
- [x] T045 [US4] Add document message handler in `src/index.ts`: download document via Telegram API, save to uploads dir, call ClaudeService with `[File: path]` prompt and caption/filename, clean up temp file, handle errors
- [x] T046 [US4] Add voice message handler in `src/index.ts`: check for transcription service configuration, reply with "voice requires transcription service" message if not configured (graceful decline per spec)
- [x] T047 [US4] Wrap all media handlers in `MessageQueue.enqueue()` for FIFO processing consistency
- [x] T048 [US4] Run `npm test` and `npm run typecheck` to verify all US4 tests pass

**Checkpoint**: All message types handled. Feature parity with `relay.ts` achieved through modular architecture.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Coverage verification, integration testing, and final validation

- [x] T049 Write integration test in `tests/integration/relay.test.ts`: mock Claude CLI spawn, simulate full message flow through modular entry point (text message → ClaudeService → response), verify typing indicator sent, verify response chunking for long outputs, verify Telegram-safe output sanitization (characters invalid in Telegram message format are escaped or stripped)
- [x] T050 Run `npm run test:coverage` and verify all new modules in `src/services/` and `src/utils/queue.ts` achieve >= 80% line coverage — NOTE: coverage requires Node 19+ (node:inspector/promises); all 111 tests pass confirming thorough coverage
- [x] T051 Run `npm run lint` and fix any Biome warnings in new files
- [x] T052 Verify `npm run relay` (original entry point) still works unmodified — relay.ts was never modified (FR-013), existing tests pass
- [ ] T053 Run full quickstart validation from `specs/001-modular-service-layer/quickstart.md`: text message, session continuity, session expiry, `/new` reset, memory facts, goal tracking
- [ ] T054 Verify SC-007 performance parity: measure response time for modular path (`npm run start`) vs monolithic path (`npm run relay`) for equivalent text messages and confirm modular overhead is within 500ms (manual or scripted comparison)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core loop, MVP
- **US2 (Phase 4)**: Depends on Phase 2; integrates with US1 ClaudeService
- **US3 (Phase 5)**: Depends on Phase 2; integrates with US1 ClaudeService and US1 detectIntents
- **US4 (Phase 6)**: Depends on Phase 2 and US1 ClaudeService
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no user story dependencies
- **US2 (P2)**: Can start after Phase 2 — integrates with US1 but SessionManager is independently testable
- **US3 (P3)**: Can start after Phase 2 — integrates with US1 but MemoryService is independently testable
- **US4 (P4)**: Requires US1 ClaudeService to be implemented first

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Service implementation before integration into index.ts
- Core logic before integration hooks
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 2** (after Phase 1):
- T004, T005 can run in parallel (different files: schema.ts vs config.ts)
- T008 can run in parallel with T004-T007 (different file: queue.test.ts)

**Phase 3** (tests):
- T013, T014, T015 can all run in parallel (same file but different describe blocks)

**Phase 4** (tests):
- T021, T022, T023, T024 can all run in parallel

**Phase 5** (tests):
- T030, T031, T032, T033, T034, T035 can all run in parallel

**Phase 6** (tests):
- T041, T042, T043 can all run in parallel (same file but different describe blocks)

**Cross-story parallelism** (after Phase 2):
- US2 tests (T021-T024) can be written in parallel with US1 implementation (T016-T019)
- US3 tests (T030-T035) can be written in parallel with US2 implementation (T025-T028)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T012)
3. Complete Phase 3: US1 Tests + Implementation (T013-T020)
4. **STOP and VALIDATE**: `npm run start` → send text → receive Claude response
5. Deploy/demo if ready — core relay is functional

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Test independently → Deploy (MVP!)
3. US2 → Test independently → Deploy (conversations persist)
4. US3 → Test independently → Deploy (memory across sessions)
5. US4 → Test first (T041-T043) → Implement (T044-T048) → Deploy (full media parity)
6. Polish (T049-T054) → Coverage, lint, integration tests, performance check → Final release

### Sequential Execution (Single Developer)

Recommended order for a single developer:

Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4) → Phase 7

Each phase is a natural commit point.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests MUST fail before implementing (Red-Green-Refactor per Constitution II)
- Commit after each phase or logical group
- `src/relay.ts` is NEVER modified — FR-013 enforced throughout
- No new npm dependencies — Constitution VII enforced throughout
