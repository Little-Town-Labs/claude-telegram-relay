# Tasks: SecondBrain Integration

**Input**: Design documents from `/specs/002-secondbrain-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/services.md, quickstart.md

**Tests**: Included per project convention (CLAUDE.md: "Always write tests"). Test-first approach per Constitution II.

**Organization**: Tasks grouped by user story. US1-US2 are P1 (MVP core), US3-US5 are P2, US6-US7 are P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Types, config extensions, and frontmatter utility that all services depend on

- [ ] T001 Define SecondBrain types (Category, Classification, CaptureResult, ScannedDocument, CaptureStats, WeeklySummary, FixResult, SecondBrainConfig) in `src/types/secondbrain.ts`
- [ ] T002 Add SecondBrain config section to Zod schema and parseEnvVars in `src/config/schema.ts` (include `chatId` field defaulting to `TELEGRAM_USER_ID` for scheduled digest delivery)
- [ ] T003 Add `secondbrain?: SecondBrainConfig` field to AppConfig interface in `src/types/config.ts`
- [ ] T004 Re-export secondbrain types from `src/types/index.ts`
- [ ] T005 Write frontmatter tests (parse flat key-values, arrays, numbers/booleans, roundtrip, edge cases) in `tests/unit/utils/frontmatter.test.ts`
- [ ] T006 Implement parseFrontmatter and stringifyFrontmatter in `src/utils/frontmatter.ts`
- [ ] T007 Export frontmatter utilities from `src/utils/index.ts`
- [ ] T008 Create classification prompt template in `src/prompts/classify.txt`
- [ ] T009 [P] Create daily digest prompt template in `src/prompts/daily_digest.txt`
- [ ] T010 [P] Create weekly review prompt template in `src/prompts/weekly_review.txt`
- [ ] T011 Verify Phase 1: run `npm run typecheck` and `npm test` — all pass

**Checkpoint**: Types, config, frontmatter, and prompt templates ready. All subsequent services can now be built.

---

## Phase 2: User Story 1 — Capture a Thought (Priority: P1)

**Goal**: User sends `/capture <text>`, system classifies via Claude CLI, stores as markdown file with YAML frontmatter, logs to inbox, replies with result.

**Independent Test**: Send `/capture Had a call with Sarah about marketing` → file created in `People/` with correct frontmatter, user receives confirmation.

### Tests for User Story 1

> **Write tests FIRST, ensure they FAIL before implementation**

- [ ] T012 [US1] Write CaptureService tests (classify returns Classification, processCapture creates file, capture convenience method, low-confidence goes to _needs_review, fallback on Claude error, filename generation, inbox log append, git commit when enabled) in `tests/unit/services/capture.test.ts`

### Implementation for User Story 1

- [ ] T013 [US1] Implement CaptureService.classify() — build classification prompt, call ClaudeService, parse JSON response, validate with Zod, fallback to admin/0.0 on error — in `src/services/capture.ts`
- [ ] T014 [US1] Implement CaptureService.processCapture() — generate filename, create category directory, write markdown with frontmatter (using stringifyFrontmatter), log to _inbox_log.md, optional git add+commit (including gitInit on first run per research.md:R4) — in `src/services/capture.ts`
- [ ] T015 [US1] Implement CaptureService.capture() convenience method (classify + processCapture) in `src/services/capture.ts`
- [ ] T016 [US1] Export CaptureService from `src/services/index.ts`
- [ ] T017 [US1] Verify: run capture tests — all pass, typecheck clean

**Checkpoint**: CaptureService independently functional. Can classify thoughts and store as markdown files.

---

## Phase 3: User Story 2 — View Capture Statistics (Priority: P1)

**Goal**: User sends `/stats`, system scans all markdown files, returns formatted counts by category.

**Independent Test**: Populate data directory with test files, call getStats(), verify counts match.

### Tests for User Story 2

- [ ] T018 [US2] Write ScannerService tests (scanAllDocuments reads all .md files, scanCategory reads one dir, parse frontmatter from files, handle empty dirs, handle missing dirs, filterByDate) in `tests/unit/services/scanner.test.ts`
- [ ] T019 [US2] Write SynthesisService.getStats() tests (total/weekly/daily counts, byCategory breakdown, avgConfidence, needsReview count, empty data) in `tests/unit/services/synthesis.test.ts`

### Implementation for User Story 2

- [ ] T020 [US2] Implement ScannerService — scanAllDocuments, scanCategory, getNeedsReview, filterByDate using fs/promises readdir+readFile+stat and parseFrontmatter — in `src/services/scanner.ts`
- [ ] T021 [US2] Implement SynthesisService.getStats() — scan all docs, count by category, compute weekly/daily/confidence stats — in `src/services/synthesis.ts`
- [ ] T022 [P] [US2] Export ScannerService and SynthesisService from `src/services/index.ts`
- [ ] T023 [US2] Verify: run scanner + synthesis tests — all pass, typecheck clean

**Checkpoint**: ScannerService and SynthesisService.getStats() independently functional. Can scan files and return statistics.

---

## Phase 4: User Story 3 — Generate Daily Digest (Priority: P2)

**Goal**: User sends `/digest`, system scans captures, identifies actionable items, prioritizes, generates natural-language digest via Claude CLI.

**Independent Test**: Populate data directory with actionable items, call generateDailyDigest(), verify formatted output with top 3 actions.

**Dependencies**: Requires ScannerService (US2)

### Tests for User Story 3

- [ ] T024 [US3] Write ScannerService.getActionableItems() tests (active projects, people with follow-ups, admin with due dates/keywords, non-actionable filtered out) — append to `tests/unit/services/scanner.test.ts`
- [ ] T025 [US3] Write SynthesisService.getDailyActions() and prioritizeActions() tests (priority scoring: deadlines +100, today +50, yesterday +30, active project +20, urgency keywords +40; limit parameter; empty data) — append to `tests/unit/services/synthesis.test.ts`
- [ ] T026 [US3] Write DigestService tests (generateDailyDigest builds prompt with action data, calls Claude, returns formatted text; handles no actionable items; handles Claude error) in `tests/unit/services/digest.test.ts`

### Implementation for User Story 3

- [ ] T027 [US3] Implement ScannerService.getActionableItems() — filter by category-specific rules (projects: active/todo status; people: has follow_ups; admin: has due_date or urgency keywords) in `src/services/scanner.ts`
- [ ] T028 [US3] Implement SynthesisService.getDailyActions() and prioritizeActions() — score and sort items, return top N — in `src/services/synthesis.ts`
- [ ] T029 [US3] Implement DigestService.generateDailyDigest() — gather actions via SynthesisService, build prompt from daily_digest.txt template, call ClaudeService, return text — in `src/services/digest.ts`
- [ ] T030 [US3] Export DigestService from `src/services/index.ts`
- [ ] T031 [US3] Verify: run digest tests — all pass, typecheck clean

**Checkpoint**: Daily digest generation independently functional. Can scan, prioritize, and generate natural-language summaries.

---

## Phase 5: User Story 4 — Generate Weekly Review (Priority: P2)

**Goal**: User sends `/digest weekly`, system generates comprehensive weekly review with stats, patterns, open loops, focus areas.

**Independent Test**: Populate data directory with a week of captures, call generateWeeklyReview(), verify formatted review.

**Dependencies**: Requires ScannerService (US2), SynthesisService (US3)

### Tests for User Story 4

- [ ] T032 [US4] Write SynthesisService.getWeeklySummary() tests (totalCaptures, byCategory, activeProjects list, peopleFollowups list, avgConfidence, needsReviewCount, empty data) — append to `tests/unit/services/synthesis.test.ts`
- [ ] T033 [US4] Write DigestService.generateWeeklyReview() tests (builds prompt with summary data, calls Claude, returns formatted text; handles empty week) — append to `tests/unit/services/digest.test.ts`

### Implementation for User Story 4

- [ ] T034 [US4] Implement SynthesisService.getWeeklySummary() — scan all docs, filter to last 7 days, compute summary stats, list active projects and people follow-ups — in `src/services/synthesis.ts`
- [ ] T035 [US4] Implement DigestService.generateWeeklyReview() — gather summary via SynthesisService, build prompt from weekly_review.txt template, call ClaudeService, return text — in `src/services/digest.ts`
- [ ] T036 [US4] Verify: run weekly review tests — all pass, typecheck clean

**Checkpoint**: Weekly review generation independently functional.

---

## Phase 6: User Story 5 — Fix Misclassification (Priority: P2)

**Goal**: User sends `/fix <category>` or `/fix <filename> <category>`, system moves file to correct directory and updates frontmatter.

**Independent Test**: Create a capture, then fix it to a different category, verify file moved and frontmatter updated.

### Tests for User Story 5

- [ ] T037 [US5] Write FixerService tests (fixCapture moves file to new category dir, updates frontmatter category field, finds last user file from inbox log, finds file by name across categories, handles invalid category, handles file not found, logs fix, git commit when enabled) in `tests/unit/services/fixer.test.ts`

### Implementation for User Story 5

- [ ] T038 [US5] Implement FixerService — fixCapture (read file, update frontmatter category, write to new dir, remove from old dir, log fix to inbox, optional git commit), findFileByName (search all category dirs), findLastUserFile (parse _inbox_log.md for last entry) — in `src/services/fixer.ts`
- [ ] T039 [US5] Export FixerService from `src/services/index.ts`
- [ ] T040 [US5] Verify: run fixer tests — all pass, typecheck clean

**Checkpoint**: FixerService independently functional. Can reclassify captures by moving files and updating metadata.

---

## Phase 7: User Story 6 — Review Low-Confidence Items (Priority: P3)

**Goal**: User sends `/review`, system lists items in `_needs_review/` with filenames, confidence, and thought preview.

**Independent Test**: Create items in `_needs_review/`, call getNeedsReview(), verify list.

**Dependencies**: Requires ScannerService (US2)

### Tests for User Story 6

- [ ] T041 [US6] Write ScannerService.getNeedsReview() additional tests (returns docs from _needs_review only, includes filename/confidence/content, empty when no items) — append to `tests/unit/services/scanner.test.ts` if not already covered in T018

### Implementation for User Story 6

- [ ] T042 [US6] Verify ScannerService.getNeedsReview() already implemented in US2 reads _needs_review/ directory — no new service code expected, just verify in `src/services/scanner.ts`
- [ ] T043 [US6] Verify: run scanner review tests — all pass

**Checkpoint**: Review capability functional via existing ScannerService.

---

## Phase 8: Telegram Bot Integration (All User Stories)

**Goal**: Wire all SecondBrain services into the bot as Telegram commands, gated behind `SECONDBRAIN_ENABLED`.

**Dependencies**: All services from US1-US6 must be complete

### Tests for Bot Integration

- [ ] T044 Write SchedulerService tests (start sets timeouts for daily/weekly, stop clears timers, getNextRuns returns next trigger times, triggerNow fires digest immediately, handles timezone calculation) in `tests/unit/services/scheduler.test.ts`

### Implementation for Bot Integration

- [ ] T045 Implement SchedulerService — start (calculate next daily/weekly run times, set setTimeout with recursive reschedule), stop (clear all timers), getNextRuns, triggerNow — in `src/services/scheduler.ts`
- [ ] T046 Export SchedulerService from `src/services/index.ts`
- [ ] T047 Wire SecondBrain commands into startBot() in `src/index.ts`: initialize services when enabled, register `/capture`, `/stats`, `/review`, `/digest`, `/digest weekly`, `/fix` commands, start SchedulerService, reply "SecondBrain is not enabled" when disabled
- [ ] T048 Verify: run scheduler tests + typecheck + lint — all pass

**Checkpoint**: All Telegram commands wired and functional. Core relay loop unchanged.

---

## Phase 9: User Story 7 — Containerized Deployment (Priority: P3)

**Goal**: User runs `infrastructure/podman-setup.sh` to create a Podman pod with the relay container. Data persists via volume mount.

**Independent Test**: Run setup script, verify pod starts, send Telegram message and get response.

- [ ] T049 [P] [US7] Create Containerfile — Node.js 18 slim, install Claude CLI via npm, copy source, configure entrypoint — in `infrastructure/Containerfile`
- [ ] T050 [P] [US7] Create .env.example — document all required/optional env vars — in `infrastructure/.env.example`
- [ ] T051 [US7] Create podman-setup.sh — create pod, create data volume, build container image, start container with env vars and volume mounts — in `infrastructure/podman-setup.sh`
- [ ] T052 [US7] Create podman-manage.sh — status, logs, stop, restart, rebuild subcommands — in `infrastructure/podman-manage.sh`

**Checkpoint**: Container deployment ready. Can be tested manually with real credentials.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Integration test, full validation, cleanup

- [ ] T053 Write integration test — capture → scan → synthesize → digest end-to-end flow with mocked Claude CLI — in `tests/integration/secondbrain.test.ts`
- [ ] T054 Run full test suite: `npm test` — all existing 111 + new tests pass
- [ ] T055 Run `npm run typecheck` — clean
- [ ] T056 Run `npm run lint` — clean (Biome strict mode)
- [ ] T057 Verify core loop intact — regular text messages still produce Claude responses when SecondBrain is disabled
- [ ] T058 Run quickstart.md validation — all documented commands work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 Capture (Phase 2)**: Depends on Phase 1 (types, config, frontmatter, prompts)
- **US2 Stats (Phase 3)**: Depends on Phase 1 (frontmatter for scanning)
- **US3 Daily Digest (Phase 4)**: Depends on US2 (ScannerService)
- **US4 Weekly Review (Phase 5)**: Depends on US2 + US3 (ScannerService + SynthesisService)
- **US5 Fix (Phase 6)**: Depends on Phase 1 (frontmatter, types)
- **US6 Review (Phase 7)**: Depends on US2 (ScannerService)
- **Bot Integration (Phase 8)**: Depends on all US1-US6
- **Container (Phase 9)**: Depends on Phase 8 (working bot)
- **Polish (Phase 10)**: Depends on all previous phases

### User Story Dependencies

- **US1 (Capture)**: Independent after Phase 1
- **US2 (Stats)**: Independent after Phase 1
- **US3 (Digest)**: Requires US2 (ScannerService)
- **US4 (Weekly)**: Requires US2 + US3 (ScannerService + SynthesisService)
- **US5 (Fix)**: Independent after Phase 1
- **US6 (Review)**: Requires US2 (ScannerService)
- **US7 (Container)**: Requires Phase 8 integration

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Utility code (scanner, frontmatter) before service code
- Service code before integration (bot wiring)
- Verify checkpoint before moving to next story

### Parallel Opportunities

- **Phase 1**: T009 + T010 (prompt templates) are parallelizable
- **US1 + US2**: Can run in parallel after Phase 1 (different files, no shared state)
- **US1 + US5**: Can run in parallel after Phase 1 (CaptureService and FixerService are independent)
- **US3 + US5**: US5 can run parallel with US3 (FixerService doesn't depend on SynthesisService)
- **Phase 9**: T049 + T050 (Containerfile + .env.example) are parallelizable

---

## Parallel Example: After Phase 1

```bash
# Launch US1 and US2 in parallel (independent services, different files):
Task: "Write CaptureService tests in tests/unit/services/capture.test.ts"      # US1
Task: "Write ScannerService tests in tests/unit/services/scanner.test.ts"      # US2

# Launch US1 and US5 in parallel (independent services):
Task: "Implement CaptureService in src/services/capture.ts"                     # US1
Task: "Implement FixerService in src/services/fixer.ts"                         # US5
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (types, config, frontmatter, prompts)
2. Complete Phase 2: US1 — Capture a Thought
3. Complete Phase 3: US2 — View Statistics
4. **STOP and VALIDATE**: `/capture` creates files, `/stats` shows counts
5. Deploy for personal use if ready

### Incremental Delivery

1. Phase 1 (Setup) → Foundation ready
2. US1 (Capture) + US2 (Stats) → Core capture + visibility (MVP!)
3. US3 (Digest) + US4 (Weekly) → AI-powered summaries
4. US5 (Fix) + US6 (Review) → Classification management
5. Phase 8 (Integration) → Full Telegram bot wiring
6. US7 (Container) → Deployment-ready
7. Phase 10 (Polish) → Production quality

### Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

---

## Summary

| Metric | Count |
|--------|-------|
| **Total tasks** | 58 |
| **Phase 1 (Setup)** | 11 |
| **US1 (Capture)** | 6 |
| **US2 (Stats)** | 6 |
| **US3 (Digest)** | 8 |
| **US4 (Weekly)** | 5 |
| **US5 (Fix)** | 4 |
| **US6 (Review)** | 3 |
| **Bot Integration** | 5 |
| **US7 (Container)** | 4 |
| **Polish** | 6 |
| **Parallel opportunities** | 8 tasks marked [P], plus US1/US2/US5 can run in parallel |
| **MVP scope** | Phase 1 + US1 + US2 (23 tasks) |
