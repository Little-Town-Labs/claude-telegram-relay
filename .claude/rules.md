# Project Rules - Claude Telegram Relay

## Architecture

This project has two entry points:

- **`src/relay.ts`** — Original monolithic relay. Fully functional, spawns Claude CLI, handles text/voice/photo/document messages. Run with `npm run relay`.
- **`src/index.ts`** — New modular entry point (in progress). Uses extracted modules from `src/config/`, `src/types/`, `src/utils/`. Currently echoes messages back without calling Claude CLI.

### Modular Structure

```
src/
  config/       # Zod-validated configuration (complete)
  types/        # TypeScript interfaces (complete, some unimplemented)
  utils/        # Logger, lock manager, telegram helpers (complete)
  index.ts      # Modular entry point (Phase 2 needed: ClaudeService)
  relay.ts      # Original working relay
```

## Migration Context

- Originally built on Bun runtime; migrated to Node.js + tsx due to Bun compatibility issues
- `child_process.spawn` used instead of Bun's `spawn`
- Vitest replaced Bun's test runner

## Pending Work

Interfaces defined but not yet implemented:
- `SessionManager` (`src/types/session.ts`) — session persistence
- `MemoryService` (`src/types/memory.ts`) — facts/goals memory
- `ClaudeService` — CLI spawn integration for `src/index.ts`

## Testing

- Framework: Vitest
- Test location: `tests/unit/` mirroring `src/` structure
- Use `tests/setup.ts` for shared fixtures (`mockEnv`, `createMockContext`, `createMockSpawn`)
- Empty `tests/unit/services/` awaiting service implementations

## Code Style

- Biome for linting and formatting
- Bracket notation for `process.env` access: `process.env["KEY"]`
- Pino for structured logging (not `console.log` in modular code)
