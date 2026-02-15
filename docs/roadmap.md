Suggested Roadmap

  Phase 1 — Infrastructure (most urgent)

  1. Service account for the secondbrain containers (sudo useradd --system secondbrain) + loginctl enable-linger
  2. podmgr to manage the containers properly with health checks and auto-restart
  3. Mount the Windows fileshare as an SMB/CIFS mount accessible to the service account

  Phase 2 — File Access

  4. File service — a new src/services/files.ts that can read/list paths from mounted directories
  5. Telegram commands — /files, /read <path>, /search <query> to browse and inject file content into Claude prompts
  6. Watcher — trigger the scanner service when files change on the share

  Phase 3 — Borrow from OpenClaw

  7. Skills architecture — OpenClaw's skills/ pattern is worth copying: define reusable prompt+action bundles (you already have prompt templates, just needs a loader)
  8. Web dashboard — a simple read-only view of memory, sessions, and digest output (OpenClaw has a full UI; you just need something basic)

  Phase 4 — Polish

  9. Proper container setup with podmgr YAML configs
  10. Alerting — your scheduler + digest already does this, wire it to Telegram notifications

  ---
  The Windows fileshare is the most impactful next step. Want me to help set up the SMB mount and the file access service?