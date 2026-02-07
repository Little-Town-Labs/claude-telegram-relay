# Quickstart: Modular Service Layer

**Feature**: 001-modular-service-layer
**Date**: 2026-02-06

## Prerequisites

- Node.js 18+
- Claude Code CLI installed and authenticated (`claude --version`)
- Telegram Bot Token (from @BotFather)
- Your Telegram User ID (from @userinfobot)

## Setup

```bash
# Ensure you're on the feature branch
git checkout 001-modular-service-layer

# Install dependencies (no new packages required)
npm install

# Copy environment file if not already done
cp .env.example .env
# Edit .env with your tokens
```

## Running

```bash
# Run the modular entry point (new)
npm run start

# Or run the original relay (unchanged)
npm run relay

# Development mode with auto-reload
npm run dev
```

## Verification

### 1. Text Message (US1 - ClaudeService)

Send any text message to your bot on Telegram. You should receive
a Claude-generated response (not the echo message from before).

### 2. Session Continuity (US2 - SessionManager)

Send: "My name is Alice"
Then send: "What's my name?"
Claude should respond with "Alice" — confirming session continuity.

### 3. Session Expiry

Wait 24 hours (or temporarily set `SESSION_TTL_MS=5000` in .env
for a 5-second TTL), then send a message. The response should not
reference prior conversation context.

### 4. Session Reset

Send: `/new`
You should see: "Session cleared. Starting fresh conversation."
Then send: "What's my name?"
Claude should not know your name.

### 5. Memory (US3 - MemoryService)

Send: "Remember that my birthday is March 15"
Claude responds, and you should see an appended note:
"Noted: I'll remember your birthday is March 15"

Reset session with `/new`, then send: "When is my birthday?"
Claude should respond with "March 15" — confirmed from memory.

### 6. Goal Tracking

Send: "Set a goal to finish the quarterly report by Friday"
You should see: "Goal set: finish the quarterly report (deadline: Friday)"

Later send: "I finished the quarterly report"
You should see: "Completed: finish the quarterly report"

### 7. Photo/Document (US4 - Media)

Send a photo with caption "What's in this image?"
You should receive Claude's analysis of the image.

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific service tests
npx vitest run tests/unit/services/claude.test.ts
npx vitest run tests/unit/services/session.test.ts
npx vitest run tests/unit/services/memory.test.ts

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Expected Coverage

All new service modules should report 80%+ line coverage:
- `src/services/claude.ts`
- `src/services/session.ts`
- `src/services/memory.ts`
- `src/utils/queue.ts`

## Troubleshooting

- **"Configuration error" at startup**: Check that `.env` has
  `TELEGRAM_BOT_TOKEN` set.
- **Echo response instead of Claude**: Verify you're running
  `npm run start` (modular) not seeing old cached behavior.
- **"Could not acquire lock"**: Another instance is running.
  Check `~/.claude-relay/bot.lock` and kill the stale process.
- **Session not resuming**: Check `~/.claude-relay/session.json`
  exists and has a valid `sessionId`.
- **Memory not injected**: Check `~/.claude-relay/memory.json`
  exists and has entries in the `facts` array.
