---
description: "Task list for 003-secondbrain-infra"
---

# Tasks: SecondBrain Infrastructure Foundation

**Input**: Design documents from `/specs/003-secondbrain-infra/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = Service Account, US2 = Container Lifecycle, US3 = Fileshare

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `infra/` directory structure and shared scaffolding
all three user stories depend on.

- [X] T001 Create `infra/` directory at repository root
- [X] T002 [P] Add `/etc/samba/credentials.secondbrain` to `.gitignore`
- [X] T003 [P] Create `infra/setup.sh` with shebang, `set -euo pipefail`,
  colour helpers (green/red/yellow print functions), and idempotency helper
  function `already_done() { echo "  already done, skipping"; }`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Install podmgr — required before any container management tasks in
User Story 2 can be verified. No user story work can begin without this.

**⚠️ CRITICAL**: User Story 2 cannot be tested without podmgr installed.

- [X] T004 Add `check_prerequisites()` function to `infra/setup.sh` that verifies
  `podman`, `systemctl`, `loginctl`, and `machinectl` are available; exits with
  code 1 if any are missing
- [X] T005 Add podmgr install block to `infra/setup.sh`: clones
  `https://github.com/Little-Town-Labs/podman-systemd-manager.git` to
  `/opt/podmgr`, creates venv, installs with `pip install -e .`, and verifies
  `podmgr --version` succeeds; skips if `/opt/podmgr/.venv/bin/podmgr` exists

**Checkpoint**: Prerequisites verified and podmgr installed — user stories can begin.

---

## Phase 3: User Story 1 — Isolated Service Account (Priority: P1) 🎯 MVP

**Goal**: `secondbrain` system account exists with no login shell, isolated home
directory, rootless-container-capable subuid/subgid mappings, and linger enabled.

**Independent Test**: Run `id secondbrain`, check `/etc/subuid`, run
`loginctl show-user secondbrain | grep Linger=yes`, confirm
`sudo -u secondbrain ls /home/backstage440` returns "Permission denied".

- [X] T006 [US1] Add service account creation block to `infra/setup.sh`:
  runs `sudo useradd --system --create-home --home-dir /var/lib/secondbrain
  --shell /usr/sbin/nologin secondbrain` only if `id secondbrain` fails;
  prints UID on success
- [X] T007 [US1] Add subuid/subgid mapping block to `infra/setup.sh`:
  appends `secondbrain:100000:65536` to `/etc/subuid` and `/etc/subgid`
  only if entry is not already present (grep check before append)
- [X] T008 [US1] Add linger-enable block to `infra/setup.sh`:
  runs `sudo loginctl enable-linger secondbrain`; verifies result with
  `loginctl show-user secondbrain | grep -q Linger=yes`
- [X] T009 [US1] Add isolation smoke test to `infra/setup.sh` (print-only,
  non-fatal): attempts `sudo -u secondbrain ls /home/backstage440 2>&1` and
  prints PASS if exit code is non-zero (access denied), FAIL if it succeeds

**Checkpoint**: User Story 1 complete — service account isolated and linger-enabled.
Run `bash infra/setup.sh` and confirm all US1 checks print green.

---

## Phase 4: User Story 2 — Managed Container Lifecycle (Priority: P2)

**Goal**: All three SecondBrain services run under `secondbrain`, defined in podmgr YAML,
auto-start at boot via systemd, restart on failure, and start in dependency order.

**Independent Test**: Run `sudo reboot`, log back in, run
`sudo machinectl shell secondbrain@ /bin/bash -c "source /opt/podmgr/.venv/bin/activate && podmgr pod status secondbrain"`
and confirm all containers show `running`.

- [X] T010 [P] [US2] Inspect running backend container to collect values needed for
  the pod YAML (T011) — MUST run before T016 cleanup:
  Backend port: `podman inspect secondbrain-backend 2>/dev/null | python3 -c
  "import sys,json; d=json.load(sys.stdin); print(d[0]['Config'].get('ExposedPorts','unknown'))"`;
  abort T011 if result is still `unknown`.
- [X] T011 [US2] Create `infra/secondbrain-pod.yaml` with the full podmgr pod
  definition: name `secondbrain`, restart_policy `always`, services `ollama`
  (HTTP health on port 11434) and `backend` (HTTP health on recorded port,
  depends_on ollama, volume `/mnt/PersonalAssistantHub:/mnt/PersonalAssistantHub:ro`); volumes
  bind-mount `/var/lib/secondbrain/ollama:/root/.ollama` for model persistence
- [X] T012 [US2] Add image export block to `infra/setup.sh` (runs as
  `backstage440`): exports `localhost/secondbrain/backend:latest` to
  `/tmp/sb-backend.tar`; skips if image already exists in secondbrain
  storage (checked via machinectl)
- [X] T013 [US2] Add image import block to `infra/setup.sh`: runs
  `sudo machinectl shell secondbrain@ /bin/bash -c "podman load -i /tmp/sb-backend.tar && podman pull docker.io/ollama/ollama:latest"`;
  cleans up tar file afterward
- [X] T014 [US2] Add podmgr init block to `infra/setup.sh`: copies
  `infra/secondbrain-pod.yaml` to `/var/lib/secondbrain/`, then runs
  `sudo machinectl shell secondbrain@ /bin/bash -c "source /opt/podmgr/.venv/bin/activate && podmgr config validate /var/lib/secondbrain/secondbrain-pod.yaml && podmgr pod init /var/lib/secondbrain/secondbrain-pod.yaml"`
- [X] T015 [US2] Add pod start and status check block to `infra/setup.sh`:
  runs `podmgr pod start secondbrain` and polls `podmgr pod status secondbrain`
  every 5 seconds for up to 90 seconds until all containers show `running`;
  exits with code 4 if timeout reached
- [X] T016 [US2] Add old-container cleanup block to `infra/setup.sh`:
  removes containers from `backstage440` storage with
  `podman rm -f secondbrain-backend secondbrain-ollama 2>/dev/null || true`
  and optionally removes locally-built backend image (prompted yes/no)

**Checkpoint**: User Story 2 complete. Verify with reboot test described above.

---

## Phase 5: User Story 3 — Windows Fileshare Access (Priority: P3)

**Goal**: Windows SMB share mounted at `/mnt/PersonalAssistantHub`, owned by `secondbrain`,
persistent across reboots, non-blocking when Windows is offline.

**Independent Test**: With Windows online, run `ls /mnt/PersonalAssistantHub` and confirm
files are listed. Unmount, take Windows offline, reboot — confirm system boots
and relay responds on Telegram without the mount blocking startup.

- [X] T017 [P] [US3] Create `infra/fstab.fragment` with the templated fstab
  line using UPPERCASE placeholders:
  `//WINDOWS-HOST/SHARE-NAME /mnt/PersonalAssistantHub cifs credentials=/etc/samba/credentials.secondbrain,uid=SECONDBRAIN-UID,gid=SECONDBRAIN-GID,file_mode=0640,dir_mode=0750,soft,_netdev,x-systemd.automount,nofail 0 0`
  and a comment block explaining each option
- [X] T018 [US3] Add cifs-utils install block to `infra/setup.sh`:
  runs `sudo apt-get install -y cifs-utils`; skips if already installed
  (check `dpkg -l cifs-utils 2>/dev/null | grep -q ^ii`)
- [X] T019 [US3] Add mount point creation block to `infra/setup.sh`:
  runs `sudo mkdir -p /mnt/PersonalAssistantHub` and
  `sudo chown secondbrain:secondbrain /mnt/PersonalAssistantHub`
- [X] T020 [US3] Add credentials file creation block to `infra/setup.sh`:
  prompts operator for Windows hostname, share name, username, password,
  and domain (default WORKGROUP); writes `/etc/samba/credentials.secondbrain`
  with `sudo tee`; sets `sudo chmod 600` and `sudo chown root:root`; skips
  if file already exists (with operator confirmation to overwrite)
- [X] T021 [US3] Add fstab append block to `infra/setup.sh`: reads UID/GID
  of `secondbrain` account, substitutes into `infra/fstab.fragment` placeholders,
  and appends the resulting line to `/etc/fstab` only if not already present
  (grep check on `/mnt/PersonalAssistantHub`); runs `sudo mount -a` and verifies
  `/mnt/PersonalAssistantHub` appears in `mount` output
- [X] T022 [US3] Add fileshare smoke test to `infra/setup.sh`:
  attempts `ls /mnt/PersonalAssistantHub` and prints PASS/FAIL; if FAIL, prints
  troubleshooting hint about Windows machine availability

**Checkpoint**: User Story 3 complete. All three user stories independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Harden the setup script, finalize documentation references, run
the full quickstart.md validation.

- [X] T023 [P] Add `--help` flag to `infra/setup.sh` that prints usage,
  prerequisite list, and operator inputs required
- [X] T024 [P] Add exit code summary table comment to top of `infra/setup.sh`
  matching the contract in `contracts/configuration-schema.md` (codes 0–5)
- [X] T025 Add final summary block to `infra/setup.sh` that prints a table
  of all smoke test results (US1, US2, US3) with PASS/FAIL status and
  overall exit code 0 only if all pass
- [X] T026 Run `quickstart.md` step-by-step validation on the machine to
  confirm all 7 steps succeed; update quickstart.md if any step is incorrect
- [X] T027 [P] Verify `.gitignore` contains `/etc/samba/credentials.secondbrain`
  and no secrets are staged: run `git status` and confirm no credential files appear

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1
- **US1 (Phase 3)**: Depends on Phase 2 — can start once setup.sh skeleton exists
- **US2 (Phase 4)**: Depends on US1 (service account must exist before containers
  can be migrated to it); T010 can run in parallel with US1
- **US3 (Phase 5)**: Depends on US1 (service account UID needed for fstab);
  can run in parallel with US2 after US1 completes
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories — implements first
- **US2 (P2)**: Depends on US1 (needs `secondbrain` account to import images)
- **US3 (P3)**: Depends on US1 only (needs UID); can run concurrently with US2

### Within Each User Story

- All `[P]`-marked tasks within a story can run in parallel
- T010 (port discovery) MUST complete before T011 (pod YAML creation)
- T012 (export) MUST complete before T013 (import)
- T014 (init) MUST complete before T015 (start)
- T020 (credentials) MUST complete before T021 (fstab append)

### Parallel Opportunities

```bash
# After Phase 1 completes, launch US1 tasks in parallel:
Task: T006 — service account creation (infra/setup.sh)
Task: T007 — subuid/subgid mappings (infra/setup.sh)
# Then T008 (linger) depends on T006

# After US1 completes, launch US2 and US3 foundational tasks in parallel:
Task: T010 — port discovery (read-only, no file changes)
Task: T017 — create infra/fstab.fragment
Task: T018 — add cifs-utils block to setup.sh
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2 (T001–T005)
2. Complete Phase 3 / US1 (T006–T009)
3. **STOP and VALIDATE**: Confirm service account isolation
4. Proceed to US2 only after US1 smoke tests pass

### Incremental Delivery

1. US1 → isolated service account → **validate**
2. US2 → containers running under service account → **validate with reboot test**
3. US3 → fileshare mounted → **validate with offline Windows test**
4. Polish → hardened script, full quickstart run

---

## Notes

- All tasks produce changes to `infra/setup.sh`, `infra/secondbrain-pod.yaml`,
  or `infra/fstab.fragment` — no changes to `src/`
- `infra/setup.sh` is the primary deliverable; it is idempotent and can be
  re-run safely
- Operator must supply SMB credentials interactively during T020 — this cannot
  be automated
- T010 (port discovery) is the only task that requires the old containers to still
  exist in `backstage440` storage; it MUST run before T016 (cleanup)
- Verify tests fail for the right reason before implementing (constitution II):
  for infrastructure, "failing test" = smoke test that prints FAIL before the
  feature is implemented
