# Implementation Plan: Modular Service Layer

**Branch**: `001-modular-service-layer` | **Date**: 2026-02-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-modular-service-layer/spec.md`

## Summary

Complete the Phase 2 migration from the monolithic `src/relay.ts` to the
modular `src/index.ts` architecture by implementing three service modules:
ClaudeService (CLI spawn orchestration), SessionManager (session persistence
with expiry), and MemoryService (facts/goals with intent detection). All
services implement existing TypeScript interfaces from `src/types/` and are
tested to 80%+ coverage. The original relay.ts remains untouched.

## Technical Context

**Language/Version**: TypeScript 5.9+ on Node.js 18+
**Primary Dependencies**: grammy 1.21+, pino 9.5+, zod 3.24+
**Storage**: Local JSON files (`~/.claude-relay/session.json`, `~/.claude-relay/memory.json`)
**Testing**: vitest 4.0+ with @vitest/coverage-v8
**Target Platform**: Linux server (systemd), macOS (launchd), Windows (PM2)
**Project Type**: Single project
**Performance Goals**: <2s CLI spawn overhead (p95), <256 MB RSS
**Constraints**: Single authorized user, no new npm dependencies required
**Scale/Scope**: Single-user personal relay; hundreds of messages/day

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Code Quality First | PASS | TypeScript strict mode enabled; Zod validates config; Biome configured |
| II | Test-First Development | PASS | Tests written before implementation; 80% coverage target in SC-002 |
| III | Testing Standards | PASS | Deterministic tests; shared fixtures in tests/setup.ts; behavior-based descriptions |
| IV | UX Consistency | PASS | Typing indicator <3s; message chunking; human-readable errors; marker stripping |
| V | Performance Requirements | PASS | <2s spawn overhead; <256 MB RSS; FIFO queue for concurrency; lock management |
| VI | Security by Default | PASS | User ID verification in middleware; array-form spawn args; no secrets in logs |
| VII | Simplicity & Minimalism | PASS | Three focused services; no new dependencies; no premature abstractions |
| VIII | Observability | PASS | Pino structured logging (FR-011); structured fields per constitution |
| IX | One Reliable Behavior | PASS | User sends message; system handles everything else |
| X | Separation of Concerns | PASS | Memory/compute/interface layers are distinct modules |
| XI | Contracts Over Creativity | PASS | TypeScript interfaces define all service contracts (FR-012) |
| XII | Build Trust Mechanisms | PASS | Structured logs as audit trail; intent marker confirmations |
| XIII | Safe Defaults | PASS | Corrupted files → fresh state; CLI timeout → user error message |
| XIV | Small Actionable Outputs | PASS | Message chunking; typing indicators; memory confirmations |
| XV | Next Action as Unit | PASS | Session state tracks specific IDs; queue entries have payloads |
| XVI | Routing Over Organizing | PASS | Message type handlers route automatically |
| XVII | Minimal Interfaces | PASS | Existing interfaces have minimal fields |
| XVIII | Design for Restart | PASS | Lock files stale-aware; session recoverable; no catch-up needed |
| XIX | Core Loop First | PASS | US1 (core loop) is P1; memory/media are P3/P4 enhancements |
| XX | Maintainability | PASS | Explicit code; well-known patterns; no clever abstractions |

**Result**: All 20 gates PASS. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-modular-service-layer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── services.md      # Service interface contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── config/
│   ├── index.ts          # Config loader (existing)
│   └── schema.ts         # Zod schema (existing, extend for session TTL)
├── types/
│   ├── index.ts          # Central exports (existing)
│   ├── config.ts         # AppConfig, ClaudeCallOptions (existing)
│   ├── session.ts        # SessionState, SessionManager (existing interface)
│   └── memory.ts         # Memory, Goal, MemoryService (existing interface)
├── services/
│   ├── index.ts          # Service exports (NEW)
│   ├── claude.ts         # ClaudeService implementation (NEW)
│   ├── session.ts        # SessionManager implementation (NEW)
│   └── memory.ts         # MemoryService implementation (NEW)
├── utils/
│   ├── index.ts          # Utility exports (existing)
│   ├── logger.ts         # Pino logger (existing)
│   ├── lock.ts           # Lock manager (existing)
│   ├── telegram.ts       # sendResponse, buildPrompt (existing)
│   └── queue.ts          # Message queue for FIFO processing (NEW)
├── index.ts              # Modular entry point (existing, UPDATE)
└── relay.ts              # Original relay (existing, DO NOT MODIFY)

tests/
├── setup.ts              # Shared fixtures (existing, extend)
├── unit/
│   ├── config/
│   │   └── config.test.ts     # (existing)
│   ├── utils/
│   │   ├── logger.test.ts     # (existing)
│   │   ├── telegram.test.ts   # (existing)
│   │   ├── lock.test.ts       # (existing)
│   │   └── queue.test.ts      # (NEW)
│   └── services/
│       ├── claude.test.ts     # (NEW)
│       ├── session.test.ts    # (NEW)
│       └── memory.test.ts     # (NEW)
└── integration/
    └── relay.test.ts          # (NEW) End-to-end modular relay test
```

**Structure Decision**: Single project layout. New code lives in
`src/services/` (3 service modules) and `src/utils/queue.ts` (message
queue). Tests mirror under `tests/unit/services/` and
`tests/integration/`. No new directories beyond what the existing
architecture implies.

## Complexity Tracking

> No constitution violations detected. This section is intentionally empty.
