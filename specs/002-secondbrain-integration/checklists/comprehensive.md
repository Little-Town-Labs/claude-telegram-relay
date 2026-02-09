# Checklist: Comprehensive Requirements Quality — SecondBrain Integration

**Purpose**: Validate completeness, clarity, consistency, and coverage of requirements across spec.md, plan.md, research.md, data-model.md, and contracts/services.md before implementation begins.
**Created**: 2026-02-08
**Focus**: All domains (service contracts, data flow, error handling, configuration, deployment)
**Depth**: Standard
**Audience**: Reviewer (pre-implementation audit)

---

## Requirement Completeness

- [ ] CHK001 - Are all six new services (Capture, Scanner, Synthesis, Digest, Scheduler, Fixer) fully specified with input/output contracts? [Completeness, Contracts §CaptureService–§FixerService]
- [ ] CHK002 - Are the Telegram command formats (`/capture`, `/stats`, `/review`, `/digest`, `/digest weekly`, `/fix`) specified with exact argument parsing rules? [Completeness, Spec §FR-012, Contracts §Telegram Command Contracts]
- [ ] CHK003 - Is the classification prompt content defined or referenced, beyond the file path `src/prompts/classify.txt`? [Gap, Plan §Project Structure]
- [ ] CHK004 - Are daily digest and weekly review prompt template contents specified, or only file paths? [Gap, Plan §Project Structure]
- [ ] CHK005 - Are all environment variables documented with types, defaults, and validation rules? [Completeness, Quickstart §Configuration]
- [ ] CHK006 - Is the `_inbox_log.md` append format fully specified with all fields and ordering? [Completeness, Data Model §Inbox Log Format]
- [ ] CHK007 - Are requirements defined for the initial data directory creation (all category subdirectories + `_needs_review/`)? [Completeness, Spec §Edge Cases]
- [ ] CHK008 - Is the git initialization flow on first run specified beyond "gitInit on first run"? [Gap, Tasks §T014, Research §R4]
- [ ] CHK009 - Are requirements for the `classify.txt` prompt's JSON response extraction defined (e.g., handling markdown code blocks around JSON)? [Gap, Research §R2]

## Requirement Clarity

- [ ] CHK010 - Is "classification accuracy at least 70%" measurable given no automated ground-truth mechanism is specified? [Measurability, Spec §SC-002]
- [ ] CHK011 - Is "under 10 seconds" for capture specified as wall-clock time or CPU time, and does it include network latency to Claude API? [Clarity, Spec §SC-001]
- [ ] CHK012 - Is the confidence threshold (0.6) specified as strict less-than or less-than-or-equal for `_needs_review/` routing? [Ambiguity, Spec §FR-004]
- [ ] CHK013 - Is "up to 1000 captures" a hard limit with enforcement, or a soft performance target? [Ambiguity, Plan §Technical Context]
- [ ] CHK014 - Is the filename generation algorithm (sanitization rules, timestamp format, collision handling) explicitly defined? [Clarity, Contracts §CaptureService.processCapture]
- [ ] CHK015 - Is "formatted for Telegram" quantified with specific markdown subset, character limits, or message splitting rules? [Clarity, Spec §FR-009, §FR-010]
- [ ] CHK016 - Are the priority scoring weights (deadlines +100, today +50, yesterday +30, active +20, urgency +40) documented in spec.md or only in tasks.md? [Clarity, Tasks §T025]

## Requirement Consistency

- [ ] CHK017 - Is `ExtractedData` type definition consistent between data-model.md (union type with `NeedsReviewData`) and research.md R2 (per-category inline fields)? [Consistency, Data Model §Classification vs Research §R2]
- [ ] CHK018 - Are category directory names consistent — spec uses lowercase (`people`, `projects`) while data-model uses TitleCase (`People/`, `Projects/`)? [Consistency, Spec §FR-001 vs Data Model §Directory Structure]
- [ ] CHK019 - Does the `SecondBrainConfig` in data-model.md include the `chatId` field added during analyze remediation? [Consistency, Research §R6 vs Data Model §SecondBrainConfig]
- [ ] CHK020 - Are the `ScannedDocument` fields consistent between data-model.md (has `title`, `status`, `confidence`) and contracts/services.md (returns `ScannedDocument[]`)? [Consistency]
- [ ] CHK021 - Is the FixerService contract signature (`fixCapture(newCategory, filename?, userId?)`) consistent with the `/fix` command's two argument forms in spec? [Consistency, Contracts §FixerService vs Spec §US5]

## Acceptance Criteria Quality

- [ ] CHK022 - Are acceptance scenarios for US1 (Capture) testable without real Claude CLI calls? [Measurability, Spec §US1]
- [ ] CHK023 - Is SC-005 ("scheduled digests fire within 60 seconds") measurable given `setTimeout` drift and timezone edge cases? [Measurability, Spec §SC-005]
- [ ] CHK024 - Is SC-007 (">=80% test coverage") measurable given the Node 18 limitation with `@vitest/coverage-v8`? [Measurability, Spec §SC-007, Memory §Gotchas]
- [ ] CHK025 - Are acceptance criteria defined for the "SecondBrain disabled" state beyond "replies not enabled"? [Gap, Spec §Edge Cases]
- [ ] CHK026 - Is SC-008 ("container responds within 60 seconds") testable in CI without real Telegram/Claude credentials? [Measurability, Spec §SC-008]

## Scenario Coverage

- [ ] CHK027 - Are requirements defined for concurrent `/capture` commands from the same user? [Coverage, Gap]
- [ ] CHK028 - Are requirements specified for what happens when a `/fix` is issued but no previous capture exists for the user? [Coverage, Spec §US5]
- [ ] CHK029 - Are requirements defined for `/digest` when classification data contains mixed confidence levels? [Coverage, Gap]
- [ ] CHK030 - Are requirements specified for scheduler behavior across DST transitions? [Coverage, Gap, Research §R3]
- [ ] CHK031 - Are requirements defined for `/capture` with empty text or whitespace-only input? [Coverage, Edge Case]
- [ ] CHK032 - Are requirements specified for what happens when the data directory is deleted while the bot is running? [Coverage, Edge Case]
- [ ] CHK033 - Are requirements defined for `/stats` when files exist but have corrupted/missing frontmatter? [Coverage, Edge Case]

## Edge Case Coverage

- [ ] CHK034 - Is behavior specified when Claude CLI returns valid JSON but with an unknown category not in the enum? [Edge Case, Research §R2]
- [ ] CHK035 - Is behavior specified when a markdown file in a category directory has no frontmatter at all? [Edge Case, Gap]
- [ ] CHK036 - Is behavior specified for filename collisions (two captures with identical sanitized name + timestamp)? [Edge Case, Gap]
- [ ] CHK037 - Is maximum thought length for `/capture` defined, considering Telegram's 4096 char message limit? [Edge Case, Gap]
- [ ] CHK038 - Is behavior specified when `_inbox_log.md` becomes very large (>10MB) after hundreds of captures? [Edge Case, Gap]
- [ ] CHK039 - Are requirements defined for handling special characters in thought text (markdown syntax, YAML-breaking characters) within frontmatter? [Edge Case, Gap]

## Non-Functional Requirements

- [ ] CHK040 - Is the "<256MB RSS" memory constraint specified with monitoring/enforcement mechanism or just as a target? [Clarity, Plan §Technical Context]
- [ ] CHK041 - Are disk space requirements or warnings specified for the data directory? [Gap]
- [ ] CHK042 - Are data backup/export requirements defined beyond git auto-commit? [Gap]
- [ ] CHK043 - Are logging requirements specified for SecondBrain operations (what level, what fields, PII handling)? [Gap, Plan §Constitution Check VIII]
- [ ] CHK044 - Are rate limiting requirements defined for Claude CLI calls to avoid API cost spikes? [Gap]
- [ ] CHK045 - Is graceful shutdown behavior specified (drain pending captures, stop scheduler, save state)? [Gap]

## Dependencies & Assumptions

- [ ] CHK046 - Is the assumption that `TELEGRAM_USER_ID` equals chat ID for private chats documented as a validated constraint? [Assumption, Research §R6]
- [ ] CHK047 - Is the Claude CLI `--print` flag behavior and output format documented as a dependency? [Dependency, Research §R2]
- [ ] CHK048 - Is the assumption that `Intl.DateTimeFormat` timezone support is available in Node 18 validated? [Assumption, Research §R3]
- [ ] CHK049 - Are requirements for Claude CLI version compatibility specified? [Dependency, Gap]
- [ ] CHK050 - Is the assumption that `fs/promises` atomic rename works across the data directory filesystem validated? [Assumption, Gap]

---

**Total items**: 50
**Traceability**: 47/50 items (94%) include spec/document references or gap markers
