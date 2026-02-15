<!--
Sync Impact Report
===================
Version change: 1.0.0 → 1.1.0 (new principles added for container, file access, and resilience)
Modified principles: none renamed
Added sections:
  - XXI. Container Isolation and Least Privilege (new)
  - XXII. Local-First Data Residency (new)
  - XXIII. Graceful Degradation (new)
  - XXIV. Infrastructure as Code (new)
  - Performance table: added 3 new rows (SMB latency, container restart, file read)
Removed sections: none
Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ no changes needed
    (Constitution Check section is dynamic; gates derive from this file)
  - .specify/templates/spec-template.md — ✅ no changes needed
    (Success Criteria section already supports measurable outcomes)
  - .specify/templates/tasks-template.md — ✅ no changes needed
    (Phase structure and test-first notes align with Principles III, IV)
Follow-up TODOs: none
-->

# Claude Telegram Relay Constitution

## Core Principles

### I. Code Quality First

All production code MUST pass static analysis (Biome) with zero
errors and zero warnings before merge. TypeScript strict mode MUST
remain enabled. Zod schemas MUST validate every external boundary
(environment variables, Telegram payloads, CLI output). No `any`
types are permitted; use `unknown` with narrowing when the type is
genuinely uncertain.

Rationale: A relay that spawns CLI processes on user input has a
high trust surface. Strict typing and validation prevent entire
classes of runtime failures.

### II. Test-First Development (Non-Negotiable)

Every new module, service, or bug fix MUST begin with a failing
test. The Red-Green-Refactor cycle is mandatory. Minimum coverage
threshold is 80% line coverage as measured by vitest. Test files
MUST mirror the `src/` directory structure under `tests/unit/`.
Integration tests for cross-module interactions MUST live under
`tests/integration/` when the module touches external boundaries
(Telegram API, Claude CLI spawn, filesystem).

Rationale: The relay is a long-running daemon. Regressions that
surface only in production are expensive because the feedback loop
is a live Telegram conversation.

### III. Testing Standards

Unit tests MUST be deterministic — no network calls, no filesystem
side effects, no timers unless explicitly mocked. Shared fixtures
(mockEnv, createMockContext, createMockSpawn) MUST live in
`tests/setup.ts` and be reused, not duplicated. Test descriptions
MUST state the expected behavior, not the implementation detail
(e.g., "returns parsed config when env is valid" not "calls
zod.parse"). Flaky tests MUST be quarantined and fixed within one
development cycle or deleted.

Rationale: Tests that cannot be trusted erode the entire testing
culture. Determinism and clarity keep the suite useful.

### IV. User Experience Consistency

Every user-facing message sent through Telegram MUST follow a
consistent formatting contract: Markdown V2 for rich text, plain
text fallback on parse failure, and a maximum initial response
within 3 seconds (typing indicator while Claude CLI runs). Error
messages MUST be human-readable and actionable — never expose raw
stack traces or internal error codes to the Telegram user. Voice,
photo, and document inputs MUST produce the same quality of
response as text inputs.

Rationale: The relay is the user's primary interface to Claude.
Inconsistent or confusing messages break trust in the system.

### V. Performance Requirements

CLI spawn overhead MUST remain under 2 seconds p95 for process
creation (excluding Claude's own processing time). Memory usage
for the relay process MUST stay below 256 MB RSS during normal
operation. The relay MUST handle concurrent messages from the
authorized user without dropping or duplicating responses. Lock
management MUST prevent concurrent Claude CLI invocations from
colliding on shared resources.

Rationale: As a long-running daemon, the relay must be stable
under sustained use without gradual resource leaks.

### VI. Security by Default

User ID verification MUST occur before any message processing —
no exceptions. Environment secrets MUST never appear in logs,
error messages, or Telegram responses. The `.env` file MUST
remain in `.gitignore`. Input passed to `child_process.spawn`
MUST use array-form arguments, never shell string interpolation.
Permissions MUST follow the principle of least privilege.

Rationale: The relay executes arbitrary CLI commands on behalf of
a Telegram user. A single authorization bypass or injection
vulnerability could compromise the host system.

### VII. Simplicity and Minimalism

Prefer the smallest change that solves the current problem. Do not
add abstractions, configuration options, or extension points until
a concrete second use case exists. YAGNI applies to every layer.
If a module has one caller, inline it until a second caller
appears. Dependencies MUST be justified — every new npm package
must solve a problem that cannot be solved with existing
dependencies or a small amount of local code.

Rationale: The relay's value proposition is simplicity. Complexity
that does not serve the user undermines the project's purpose.

### VIII. Observability

All non-trivial operations MUST log through Pino (never
`console.log` in modular code). Log levels MUST be used correctly:
`error` for failures requiring attention, `warn` for degraded
states, `info` for significant lifecycle events, `debug` for
development diagnostics. Structured fields (requestId, userId,
sessionId) MUST be attached to log entries for traceability.

Rationale: A headless daemon that runs under systemd or launchd
is only as debuggable as its logs.

## SecondBrain Engineering Principles

The following principles are adapted from the SecondBrain
methodology and apply to how this project manages information
flow, system resilience, and user-facing behavior.

### IX. One Reliable Behavior

Reduce the user's required interaction to a single reliable
action. The user sends a message on Telegram. Everything else —
routing, spawning, formatting, responding — is the system's job.
Every temptation to add a manual step MUST be evaluated against
"can the system do this automatically instead?"

### X. Separation of Concerns

Memory (configuration, session state) MUST be separated from
compute (message handling, CLI orchestration) and interface
(Telegram bot API). Each layer has one job. Swapping the Telegram
interface for another channel MUST NOT require rewriting the CLI
integration. Swapping the Claude CLI for another tool MUST NOT
require rewriting the Telegram layer.

### XI. Contracts Over Creativity

Interfaces between modules MUST behave like contracts: fixed input
types, fixed output types, no surprises. TypeScript interfaces and
Zod schemas enforce these contracts at compile time and runtime
respectively. When a module's behavior is ambiguous, clarify the
contract rather than adding defensive code in the caller.

### XII. Build Trust Mechanisms

The system MUST provide visibility into what happened and why.
Structured logs serve as the audit trail. Error responses MUST
tell the user what went wrong in terms they can act on. Confidence
in the system comes from transparency, not from silence.

### XIII. Safe Defaults Under Uncertainty

When the system encounters an unexpected state — malformed input,
CLI timeout, unknown message type — it MUST fail safely. Safe
means: log the anomaly, inform the user that something went wrong,
and do not corrupt state. Never guess. Never silently drop.

### XIV. Small, Frequent, Actionable Outputs

Responses to the user MUST be concise and actionable. Long Claude
outputs MUST be chunked into Telegram-friendly message sizes.
Status updates (typing indicators, progress messages for long
tasks) MUST be frequent enough that the user knows the system is
working. Silence beyond 3 seconds without a typing indicator is a
UX bug.

### XV. Next Action as Unit of Work

Internal task tracking, session state, and pending operations MUST
be expressed as concrete next actions, not vague intentions. A
session record says "waiting for CLI response to message X" not
"processing." Queue entries have specific payloads, not references
to "pending work."

### XVI. Routing Over Organizing

Message handling MUST route inputs to the correct handler (text,
voice, photo, document) based on message type, not require the
user to pre-classify their input. The system classifies; the user
just sends.

### XVII. Keep Interfaces Minimal

Configuration options, service interfaces, and message formats
MUST start with the minimum viable set of fields. Add fields only
when a concrete use case demands them. A five-field config is
better than a twenty-field config with fifteen defaults.

### XVIII. Design for Restart

The relay MUST handle ungraceful shutdown and restart without data
loss or corruption. Lock files MUST be stale-aware. Session state
MUST be recoverable. The system MUST not require "catching up" on
missed messages — it simply resumes from the current moment.

### XIX. Core Loop First, Modules Later

The core loop (receive message → spawn CLI → send response) MUST
be stable and tested before any enhancement module (voice
transcription, memory persistence, scheduled tasks) is added.
Enhancement modules MUST attach to the core loop without modifying
it. If a module breaks, the core loop MUST continue functioning.

### XX. Maintainability Over Cleverness

Fewer moving parts means fewer failure points. Prefer explicit
code over clever abstractions. Prefer well-known patterns over
novel approaches. Every line of code MUST be understandable by a
developer reading it for the first time without consulting
external documentation.

## Infrastructure Principles

The following principles govern the deployment, container
management, and system-level behavior of the assistant
infrastructure.

### XXI. Container Isolation and Least Privilege

Every containerized service MUST run under a dedicated non-root
service account (e.g., `secondbrain`). No container MUST run as
root on the host. Each container MUST be granted only the
filesystem mounts and network access it requires — nothing more.
Volume mounts to sensitive host paths (home directories, secrets
files) MUST be read-only unless write access is explicitly
required. `loginctl enable-linger` MUST be set on any service
account whose containers must survive user logout.

Rationale: Containers that run as root or with excessive mounts
turn a container escape into a full host compromise. Isolation
limits blast radius.

### XXII. Local-First Data Residency

All user data — session state, memory, files, conversation
history — MUST reside on the local machine by default. No feature
MUST require routing user content through a third-party cloud
service unless the user explicitly enables it. Local AI (Ollama)
MUST be preferred over cloud AI for tasks where quality is
sufficient. When cloud services are used (Telegram Bot API,
Claude CLI), the minimum necessary data MUST be transmitted.

Rationale: This is a personal assistant on a personal machine.
The user's notes, files, and conversation history are private
by default. Cloud services are tools, not data stores.

### XXIII. Graceful Degradation

The system MUST remain partially functional when non-core
services fail. If the SecondBrain backend is unavailable, the
Telegram relay MUST still respond to messages using Claude CLI
alone. If Ollama is unavailable, digest and synthesis services
MUST fall back or skip rather than crash the relay. If the
Windows fileshare is unmounted, file-access commands MUST return
a clear error rather than hanging. Each service dependency MUST
have an explicit unavailability behavior documented in its module.

Rationale: A personal assistant that goes fully dark because one
container is down is worse than an assistant with reduced
capability. Partial availability preserves trust.

### XXIV. Infrastructure as Code

All container configurations, systemd service units, and pod
definitions MUST be version-controlled. Manual `podman run`
commands are acceptable for exploration only — production
deployments MUST be driven by podmgr YAML configs or equivalent
declarative files committed to the repository. Environment
variables for containers MUST be stored in `.env`-style files
tracked in the repo (with secrets excluded via `.gitignore`).
Rebuilding the full stack from a fresh clone MUST be possible
with a single documented command sequence.

Rationale: Infrastructure that exists only in shell history or
operator memory cannot be audited, reproduced, or recovered
after a hardware failure.

## Performance & Reliability Standards

| Metric | Target | Measurement |
|---|---|---|
| CLI spawn latency (p95) | < 2s | Process creation to first stdout byte |
| Relay RSS memory | < 256 MB | Steady state under normal use |
| Message drop rate | 0% | No authorized messages lost |
| Typing indicator latency | < 3s | Time from message receipt to indicator |
| Uptime (daemon) | 99.5% | Measured over rolling 30-day window |
| Test suite pass rate | 100% | All tests green before merge |
| Code coverage | >= 80% | Line coverage via vitest |
| SMB read latency (p95) | < 500ms | File read from Windows fileshare mount |
| Container restart time | < 30s | From failure detection to healthy state |
| Core loop availability | 100% | Relay responds even when modules degrade |

## Development Workflow

1. **Read before writing**: Always read existing code before
   modifying it. Understand the current behavior first.
2. **Test first**: Write a failing test that specifies the desired
   behavior. Get the test to fail for the right reason.
3. **Implement minimally**: Write the smallest change that makes
   the test pass.
4. **Refactor if needed**: Clean up only if the code violates an
   existing principle. Do not refactor speculatively.
5. **Verify**: Run `npm test` and `npm run typecheck` before
   considering work complete.
6. **Commit conventionally**: Use conventional commit format with
   clear, focused messages.

## Governance

This constitution is the highest-authority document for
development practices in the Claude Telegram Relay project. When
a practice conflicts with this constitution, the constitution
prevails.

**Amendments** require:
1. A written proposal describing the change and its rationale.
2. An impact assessment identifying affected modules and tests.
3. A migration plan if the change affects existing code.
4. Version increment following semantic versioning:
   - MAJOR: Principle removal or backward-incompatible redefinition.
   - MINOR: New principle or materially expanded guidance.
   - PATCH: Clarification, wording, or typo fix.

**Compliance** is verified through:
- Code review against constitution principles.
- Automated checks (Biome, vitest coverage, typecheck).
- Periodic audit of logging, error handling, and security
  practices.

**Runtime guidance**: See `.claude/rules.md` for project-specific
development patterns and `project-config.json` for commands and
agent routing.

**Version**: 1.1.0 | **Ratified**: 2026-02-06 | **Last Amended**: 2026-02-15
