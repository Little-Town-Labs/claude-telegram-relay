# Quickstart: SecondBrain Integration

## Prerequisites

- Node.js 18+
- Claude CLI (`npm install -g @anthropic-ai/claude-code`) with valid API key
- Podman (for container deployment)
- Telegram bot token (from @BotFather)

## Local Development

```bash
# 1. Clone and checkout feature branch
git checkout 002-secondbrain-integration

# 2. Install dependencies (no new deps needed)
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env:
#   TELEGRAM_BOT_TOKEN=your_token
#   TELEGRAM_USER_ID=your_id
#   SECONDBRAIN_ENABLED=true
#   SECONDBRAIN_DATA_DIR=~/.claude-relay/secondbrain

# 4. Run tests
npm test

# 5. Start in development mode
npm run dev
```

## Testing Commands in Telegram

```
# Capture a thought
/capture Had a call with Sarah about Q2 launch. Follow up next week.

# View statistics
/stats

# Generate daily digest
/digest

# Generate weekly review
/digest weekly

# Review low-confidence items
/review

# Fix last capture's category
/fix projects

# Fix specific file
/fix sarah-20260207-143015.md people
```

## Container Deployment

```bash
# 1. Build and run in Podman pod
cd infrastructure/
./podman-setup.sh

# 2. Check status
./podman-manage.sh status

# 3. View logs
./podman-manage.sh logs

# 4. Stop
./podman-manage.sh stop
```

## Configuration

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SECONDBRAIN_ENABLED` | `false` | Enable SecondBrain features |
| `SECONDBRAIN_DATA_DIR` | `~/.claude-relay/secondbrain` | Data directory |
| `SECONDBRAIN_CONFIDENCE_THRESHOLD` | `0.6` | Below this → needs_review |
| `SECONDBRAIN_GIT_ENABLED` | `false` | Enable git auto-commit |
| `SECONDBRAIN_DIGEST_DAILY_ENABLED` | `true` | Enable daily digest |
| `SECONDBRAIN_DIGEST_DAILY_TIME` | `07:00` | Daily digest time (24h) |
| `SECONDBRAIN_DIGEST_DAILY_TIMEZONE` | `America/Chicago` | Timezone |
| `SECONDBRAIN_DIGEST_WEEKLY_ENABLED` | `true` | Enable weekly review |
| `SECONDBRAIN_DIGEST_WEEKLY_DAY` | `sunday` | Weekly review day |
| `SECONDBRAIN_DIGEST_WEEKLY_TIME` | `16:00` | Weekly review time |

## Architecture

```
src/
├── services/
│   ├── capture.ts          # Classify + store thoughts
│   ├── scanner.ts          # Read markdown files
│   ├── synthesis.ts        # Prioritize + summarize
│   ├── digest.ts           # Generate natural language digests
│   ├── scheduler.ts        # Timer-based scheduling
│   ├── fixer.ts            # Reclassify captures
│   ├── claude.ts           # (existing) CLI spawn
│   ├── session.ts          # (existing) Session persistence
│   └── memory.ts           # (existing) Facts/goals
├── utils/
│   └── frontmatter.ts      # YAML frontmatter parse/serialize
├── types/
│   └── secondbrain.ts      # SecondBrain types
├── prompts/
│   ├── classify.txt        # Classification prompt
│   ├── daily_digest.txt    # Daily digest template
│   └── weekly_review.txt   # Weekly review template
└── index.ts                # Bot wiring with SecondBrain commands

infrastructure/
├── Containerfile           # Node.js + Claude CLI
├── podman-setup.sh         # Pod creation
├── podman-manage.sh        # Management commands
└── .env.example            # Required env vars
```
