# Configuration Contracts: SecondBrain Infrastructure Foundation

**Feature**: 003-secondbrain-infra
**Date**: 2026-02-15

> This feature has no API endpoints. Contracts are configuration file schemas
> and the interface between the setup script and the operator.

---

## Contract 1: Pod YAML (podmgr)

**File**: `infra/secondbrain-pod.yaml`
**Consumer**: podmgr CLI → generates systemd user units
**Validation**: `podmgr config validate infra/secondbrain-pod.yaml`

### Required Fields

| Field | Type | Constraint |
|---|---|---|
| `name` | string | Must be `secondbrain` |
| `restart_policy` | enum | Must be `always` |
| `services[].name` | string | Must match container name |
| `services[].image` | string | Must exist in `secondbrain` Podman storage |
| `services[].health_check.type` | enum | `http`, `tcp`, or `command` |
| `services[].health_check.retries` | int | Must be `>= 3` (constitution XXI) |

### Dependency Contract

Services MUST be listed in this order so podmgr resolves dependencies correctly:
1. `ollama` (no dependencies)
2. `backend` (depends_on: `ollama`)

---

## Contract 2: Setup Script Interface

**File**: `infra/setup.sh`
**Consumer**: Operator (backstage440 with sudo)
**Contract**: Idempotent — running it twice must not fail or duplicate entries

### Inputs (prompted at runtime)

| Input | Validation |
|---|---|
| Windows hostname/IP | Must be non-empty string |
| SMB share name | Must be non-empty string |
| Windows username | Must be non-empty string |
| Windows password | Must be non-empty string |
| Domain | Defaults to `WORKGROUP` if empty |

### Outputs (files written)

| Output | Path | Owner | Mode |
|---|---|---|---|
| Credentials file | `/etc/samba/credentials.secondbrain` | `root:root` | `600` |
| Mount point | `/mnt/fileshare/` | `secondbrain:secondbrain` | `750` |
| fstab fragment | Appended to `/etc/fstab` | (root-owned file) | n/a |

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | All steps completed successfully |
| 1 | Required command not found (e.g., podmgr not installed) |
| 2 | Service account creation failed |
| 3 | Image migration failed |
| 4 | podmgr pod init failed |
| 5 | Mount test failed |

---

## Contract 3: Verified Outcomes (Smoke Tests)

These are the verifiable post-setup assertions used in quickstart.md validation.

| Test | Command | Expected Result |
|---|---|---|
| Service account exists | `id secondbrain` | Prints UID/GID, no error |
| Linger enabled | `loginctl show-user secondbrain \| grep Linger` | `Linger=yes` |
| subuid mapped | `grep secondbrain /etc/subuid` | `secondbrain:100000:65536` |
| Images migrated | `machinectl shell secondbrain@ ... podman images` | Shows 2 images |
| Containers healthy | `podmgr pod status secondbrain` | Both show `running` |
| Fileshare mounted | `mount \| grep fileshare` | Shows cifs mount |
| Fileshare readable | `ls /mnt/fileshare` | Lists Windows files |
| Isolation enforced | `sudo -u secondbrain ls /home/backstage440` | Permission denied |
| Survives reboot | (reboot + re-run checks) | All checks pass |
