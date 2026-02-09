# Feature Specification: SecondBrain Integration

**Feature Branch**: `002-secondbrain-integration`
**Created**: 2026-02-07
**Status**: Draft
**Input**: Port SecondBrain knowledge management (capture, classification, digests, synthesis, reclassification) from Python/Discord/Ollama into TypeScript Telegram relay, using Claude CLI and Podman containerization.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a Thought (Priority: P1)

The user sends `/capture Had a great call with Sarah about Q2 launch. Follow up next week.` in Telegram. The system classifies this as a "people" category capture using Claude CLI, creates a markdown file with YAML frontmatter in `~/.claude-relay/secondbrain/People/`, logs it to the inbox, and replies with the classification result and confidence score.

**Why this priority**: Capture is the foundational SecondBrain operation. Without it, nothing else works.

**Independent Test**: Send `/capture` with various thought types and verify correct classification, file creation, and Telegram response.

**Acceptance Scenarios**:

1. **Given** the bot is running with SecondBrain enabled, **When** the user sends `/capture Had a call with Sarah about marketing`, **Then** a markdown file is created in `People/` with category, confidence, extracted data in frontmatter, and the user receives a confirmation with category and confidence.
2. **Given** a thought with low confidence (<0.6), **When** captured, **Then** the file is stored in `_needs_review/` and the user is told the classification needs review.
3. **Given** a thought about a project, **When** captured, **Then** the file is stored in `Projects/` with status, next_action, and notes in frontmatter.
4. **Given** git auto-commit is enabled, **When** a thought is captured, **Then** the file is committed to git automatically.

---

### User Story 2 - View Capture Statistics (Priority: P1)

The user sends `/stats` in Telegram. The system scans all markdown files, counts by category, and returns a formatted summary with total captures, weekly count, daily count, and category breakdown.

**Why this priority**: Core visibility into the knowledge base. Necessary for users to understand what's been captured.

**Independent Test**: Populate data directory with test files, send `/stats`, verify counts match.

**Acceptance Scenarios**:

1. **Given** the data directory has captures across categories, **When** the user sends `/stats`, **Then** they receive total count, this week's count, today's count, category breakdown, and actionable item count.
2. **Given** the data directory is empty, **When** the user sends `/stats`, **Then** they receive a message indicating no captures yet.

---

### User Story 3 - Generate Daily Digest (Priority: P2)

The user sends `/digest` in Telegram, or the scheduler triggers at the configured daily time. The system scans captures, identifies actionable items, prioritizes them, generates a natural-language digest via Claude CLI, and delivers it to the Telegram chat.

**Why this priority**: Digests transform raw captures into actionable intelligence. This is the synthesis layer that makes SecondBrain valuable.

**Independent Test**: Populate data directory with actionable items, invoke `/digest`, verify formatted digest with top 3 actions, people follow-ups, and watch-out items.

**Acceptance Scenarios**:

1. **Given** actionable captures exist, **When** the user sends `/digest`, **Then** they receive a formatted daily digest with top 3 actions, people to connect with, and one watch-out item.
2. **Given** no actionable items exist, **When** the user sends `/digest`, **Then** they receive a friendly "all caught up" message.
3. **Given** daily digest is enabled in config, **When** the configured time arrives (e.g., 7:00 AM), **Then** the digest is automatically sent to the Telegram chat.

---

### User Story 4 - Generate Weekly Review (Priority: P2)

The user sends `/digest weekly` in Telegram, or the scheduler triggers at the configured weekly time. The system generates a comprehensive weekly review with stats, patterns, open loops, and suggested focus areas.

**Why this priority**: Weekly reviews provide reflection and planning. Paired with daily digests, they complete the productivity loop.

**Independent Test**: Populate data directory with a week of captures, invoke `/digest weekly`, verify formatted review.

**Acceptance Scenarios**:

1. **Given** captures from the past week exist, **When** the user sends `/digest weekly`, **Then** they receive a review with quick stats, progress highlights, open loops, patterns, and suggested focus.
2. **Given** the weekly schedule is enabled, **When** the configured day/time arrives (e.g., Sunday 4 PM), **Then** the weekly review is automatically sent.

---

### User Story 5 - Fix Misclassification (Priority: P2)

The user sends `/fix projects` to reclassify their last capture, or `/fix sarah-20260207-143015.md people` to fix a specific file. The system moves the file to the correct category directory, updates the frontmatter, and confirms the change.

**Why this priority**: Classification is imperfect. Users need a quick way to correct mistakes without manually editing files.

**Independent Test**: Capture a thought, then `/fix` it to a different category, verify file moved and frontmatter updated.

**Acceptance Scenarios**:

1. **Given** the user's last capture was classified as "admin", **When** they send `/fix projects`, **Then** the file moves from `Admin/` to `Projects/`, frontmatter updates, and user receives confirmation.
2. **Given** a specific filename, **When** the user sends `/fix sarah-20260207.md people`, **Then** that specific file is reclassified.
3. **Given** an invalid category, **When** the user sends `/fix invalid`, **Then** they receive an error listing valid categories.

---

### User Story 6 - Review Low-Confidence Items (Priority: P3)

The user sends `/review` in Telegram. The system lists all items in the `_needs_review/` directory with their filenames, confidence scores, and original thought text.

**Why this priority**: Cleanup of uncertain classifications. Less critical than capture and digests.

**Independent Test**: Create items in `_needs_review/`, send `/review`, verify list.

**Acceptance Scenarios**:

1. **Given** items exist in `_needs_review/`, **When** the user sends `/review`, **Then** they receive a list with filename, confidence, and thought preview for each item.
2. **Given** no items need review, **When** the user sends `/review`, **Then** they receive "No items need review."

---

### User Story 7 - Containerized Deployment (Priority: P3)

The user runs `infrastructure/podman-setup.sh` to create a Podman pod with the Telegram relay container. The container has Node.js, Claude CLI, and the relay source. Data is persisted via a mounted volume.

**Why this priority**: Container deployment is the delivery mechanism but the features must work first.

**Independent Test**: Run setup script, verify pod and container are running, send a Telegram message and get a response.

**Acceptance Scenarios**:

1. **Given** Podman is installed and `ANTHROPIC_API_KEY` + `TELEGRAM_BOT_TOKEN` are set, **When** the user runs `podman-setup.sh`, **Then** a pod with the relay container starts and responds to Telegram messages.
2. **Given** the container is running, **When** it is stopped and restarted, **Then** all captured data persists via the volume mount.

---

### Edge Cases

- What happens when Claude CLI fails to return valid JSON for classification? Falls back to "admin" category with 0.0 confidence.
- What happens when the data directory doesn't exist? Created automatically on first capture.
- What happens when a `/fix` targets a file that doesn't exist? User receives "File not found" error.
- What happens when the scheduler's sendMessage call fails (network error, rate limit)? Digest is logged but delivery marked failed; next scheduled trigger retries.
- What happens when SecondBrain is disabled in config? All `/capture`, `/stats`, `/digest`, `/review`, `/fix` commands reply with "SecondBrain is not enabled."
- What happens when classification takes longer than the CLI timeout? Returns error to user, no file is created.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST classify thoughts into one of four categories: people, projects, ideas, admin.
- **FR-002**: System MUST use Claude CLI for classification with a structured JSON prompt.
- **FR-003**: System MUST store captures as markdown files with YAML frontmatter.
- **FR-004**: System MUST support confidence thresholds — captures below threshold go to `_needs_review/`.
- **FR-005**: System MUST log all captures to `_inbox_log.md` for audit trail.
- **FR-006**: System MUST support git auto-commit for captures (configurable).
- **FR-007**: System MUST scan markdown files and extract actionable items based on category-specific rules.
- **FR-008**: System MUST prioritize actions using a scoring system (deadlines, recency, status, urgency keywords).
- **FR-009**: System MUST generate daily digests with top 3 actions, people follow-ups, and watch-out items via Claude CLI.
- **FR-010**: System MUST generate weekly reviews with stats, patterns, open loops, and suggested focus via Claude CLI.
- **FR-011**: System MUST schedule automated daily and weekly digests at configurable times/timezones.
- **FR-012**: System MUST support reclassification of captures via `/fix` command.
- **FR-013**: System MUST NOT modify `src/relay.ts` (preserved from spec-001).
- **FR-014**: System MUST keep the core text→Claude→response loop functional even if SecondBrain services fail.
- **FR-015**: System MUST be deployable as a Podman container with Claude CLI.
- **FR-016**: System MUST use a separate data directory (`~/.claude-relay/secondbrain/`) independent of any Discord captures.
- **FR-017**: System MUST coexist with the existing MemoryService (facts/goals) without conflicts.
- **FR-018**: YAML frontmatter MUST be handled with local code (no new npm dependency for YAML parsing).

### Key Entities

- **Capture**: A classified thought stored as a markdown file. Has category, confidence, extracted data, creation timestamp, optional user ID.
- **Category**: One of people, projects, ideas, admin. Each has a directory and category-specific extracted fields.
- **Classification**: The AI-generated result with category, confidence score, extracted data, and reasoning.
- **Digest**: A natural-language summary generated from actionable items. Can be daily (top 3 actions) or weekly (full review).
- **ScheduledJob**: A timer-based job that triggers digest generation at configured times.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `/capture` successfully classifies and stores a thought in under 10 seconds (including Claude CLI call).
- **SC-002**: Classification accuracy is at least 70% correct category assignment (measured by user corrections via `/fix`).
- **SC-003**: `/stats` returns accurate counts within 2 seconds for up to 1000 captures.
- **SC-004**: `/digest` generates and delivers a formatted digest within 30 seconds.
- **SC-005**: Scheduled digests fire within 60 seconds of configured time.
- **SC-006**: Core relay functionality (text→Claude→response) remains unaffected when SecondBrain is disabled.
- **SC-007**: All new services have >= 80% test coverage.
- **SC-008**: Container starts and responds to messages within 60 seconds of pod creation.
