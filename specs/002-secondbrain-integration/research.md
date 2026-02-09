# Research: SecondBrain Integration

**Feature Branch**: `002-secondbrain-integration`
**Date**: 2026-02-07

## R1: YAML Frontmatter Without New Dependencies

**Decision**: Implement minimal local frontmatter module (~60 lines)

**Rationale**: The YAML structures used in SecondBrain frontmatter are flat key-value pairs with string, number, and simple array values. No nested objects, no anchors, no complex YAML features. A minimal parser that handles `---` delimiters with `key: value` pairs is sufficient and avoids adding a YAML parsing dependency.

**Alternatives considered**:
- `yaml` npm package: Full YAML parser, but violates Constitution VII for a use case solvable with ~60 lines of local code.
- `gray-matter` npm package: Full frontmatter library, but brings transitive YAML dependency.
- JSON frontmatter instead of YAML: Would work but breaks the established SecondBrain convention and makes files less human-readable.

**Implementation approach**:
- Write: Serialize flat object as `key: value` lines, wrap in `---` delimiters
- Read: Split file on first two `---` markers, parse key-value lines
- Arrays: Serialize as `key:\n  - item1\n  - item2`, parse indented `- ` lines
- Numbers/booleans: Auto-detect on parse, format as-is on write
- Located at: `src/utils/frontmatter.ts`

## R2: Claude CLI for Structured JSON Classification

**Decision**: Use ClaudeService.call() with a classification prompt that requests JSON output

**Rationale**: Claude is significantly more capable than Llama 3.1 at producing reliable structured JSON. The existing ClaudeService already handles spawn, timeout, and error recovery. The classification prompt from SecondBrain's `classify.txt` maps directly — we just instruct Claude to return JSON.

**Alternatives considered**:
- Ollama in a separate container: Would replicate SecondBrain exactly but adds complexity (another container, model download, Ollama client). User explicitly chose Claude CLI only.
- Claude API directly (not CLI): Would require adding `@anthropic-ai/sdk` as a dependency. CLI is already integrated.

**Expected JSON response schema**:

Claude must return ONLY a JSON object matching this structure:
```json
{
  "category": "people" | "projects" | "ideas" | "admin",
  "confidence": 0.0-1.0,
  "reasoning": "string explaining why this category was chosen",
  "extracted_data": {
    // For "people": { "name": "string", "context": "string", "follow_ups": "string?", "tags": ["string"]? }
    // For "projects": { "name": "string", "status": "active"|"waiting"|"blocked"|"someday"|"todo", "next_action": "string", "notes": "string?", "tags": ["string"]? }
    // For "ideas": { "name": "string", "one_liner": "string", "notes": "string?", "tags": ["string"]? }
    // For "admin": { "name": "string", "due_date": "YYYY-MM-DD?", "notes": "string?" }
  }
}
```

Validation: Zod schema validates the parsed JSON. On validation failure, fall back to `{ category: "admin", confidence: 0.0, reasoning: "parse error", extracted_data: { name: "unknown", notes: originalText } }`.

**Implementation approach**:
- Port `classify.txt` prompt to `src/prompts/classify.txt`
- CaptureService calls `claudeService.call(classificationPrompt)` with `--print`
- Parse JSON from Claude's response using `JSON.parse()` with fallback repair (extract JSON from markdown code blocks if needed)
- Validate classification result with Zod schema

## R3: Timer-Based Scheduling Without Cron Library

**Decision**: Use `setTimeout` with next-run calculation

**Rationale**: The schedule is simple — one daily trigger and one weekly trigger. A cron library (node-cron, later, etc.) would be overkill and violate Constitution VII.

**Alternatives considered**:
- `node-cron`: Full cron expression support, but only needed for two simple schedules.
- `node-schedule`: Similar — unnecessarily powerful for two fixed schedules.
- System cron (crontab): Would work but makes the relay dependent on host system configuration and harder to containerize.

**Implementation approach**:
- `calculateNextRun(targetTime, timezone)`: Returns Date of next occurrence
- `scheduleJob(fn, targetTime, timezone)`: Sets setTimeout for the delay, then reschedules recursively
- Timezone handling: Use `Intl.DateTimeFormat` with timezone option (built into Node.js, no library needed)
- Store timer refs for cleanup on shutdown

## R4: Git Integration via child_process

**Decision**: Use `child_process.spawn` for git operations (same pattern as ClaudeService)

**Rationale**: Git operations needed are simple: `git add`, `git commit`. The spawn pattern is already established in ClaudeService. Adding `simple-git` or `isomorphic-git` would be unjustified given the narrow use case.

**Alternatives considered**:
- `simple-git`: Full git wrapper, but only need add + commit. Violates Constitution VII.
- `isomorphic-git`: JavaScript git implementation, but heavyweight for two commands.

**Implementation approach**:
- `gitAdd(filePath, dataDir)`: `spawn("git", ["add", relativePath], { cwd: dataDir })`
- `gitCommit(message, dataDir)`: `spawn("git", ["commit", "-m", message], { cwd: dataDir })`
- `gitInit(dataDir)`: `spawn("git", ["init"], { cwd: dataDir })` (first run only)
- All operations are optional (configurable) and non-blocking (failures logged, not thrown)

## R5: Podman Container with Claude CLI

**Decision**: Node.js 18 base image + Claude CLI installed via npm, auth via `ANTHROPIC_API_KEY` env var

**Rationale**: Claude CLI (`claude --print`) uses the Anthropic API key directly. Setting `ANTHROPIC_API_KEY` as an environment variable in the container is sufficient for authentication. No need to mount `~/.claude` directory.

**Alternatives considered**:
- Mount Claude CLI from host: Complex, path issues across environments.
- Mount `~/.claude` config directory: Over-shares host secrets into container.
- Use Claude API SDK directly instead of CLI: Would bypass the entire ClaudeService architecture.

**Implementation approach**:
- Containerfile: `FROM node:18-slim`, `npm install -g @anthropic-ai/claude-code`
- Runtime env: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`
- Data volume: Mount host directory to `/data` for persistent captures
- Config volume: Mount `~/.claude-relay/` for session/memory files
- Single-container pod (expandable later)

## R6: SecondBrain Feature Toggle

**Decision**: All SecondBrain functionality gated behind `SECONDBRAIN_ENABLED` env var (default: false)

**Rationale**: Constitution XIX mandates that enhancement modules attach to the core loop without modifying it. If SecondBrain is disabled or broken, the core relay continues functioning.

**Implementation approach**:
- Config schema adds `secondbrain.enabled` (boolean, default false)
- In `startBot()`, SecondBrain services are only initialized if enabled
- Commands (`/capture`, `/stats`, `/digest`, `/review`, `/fix`) reply with "SecondBrain is not enabled" if disabled
- Scheduler only starts if enabled
- Core text handler is unchanged — it still goes through ClaudeService + MemoryService
- **Chat ID for scheduled digests**: SchedulerService needs a chat ID to proactively send messages via `bot.api.sendMessage()`. For private chats, Telegram user ID = chat ID. Use `TELEGRAM_USER_ID` (already required) as the target chat ID. Add `chatId` to SecondBrainConfig, defaulting to `TELEGRAM_USER_ID`.

## R7: Coexistence with MemoryService

**Decision**: Keep both systems independent — MemoryService for quick facts/goals, CaptureService for rich categorized knowledge

**Rationale**: MemoryService handles `[REMEMBER:]`, `[GOAL:]`, `[DONE:]` intent markers embedded in Claude's responses — lightweight, automatic, inline. CaptureService handles explicit `/capture` commands — richer, classified, stored as files. They serve different purposes and don't overlap.

**Implementation approach**:
- MemoryService continues to work on all text messages (via intent detection)
- CaptureService only activates on `/capture` commands
- They share no data structures or files
- MemoryService data: `~/.claude-relay/memory.json`
- CaptureService data: `~/.claude-relay/secondbrain/People/`, etc.
