# Configuration Contracts: SecondBrain Infrastructure Foundation

**Feature**: 003-secondbrain-infra
**Date**: 2026-02-15

> This feature has no API endpoints. Contracts are configuration file schemas
> and the interface between the setup script and the operator.

---

## Contract 1: Quadlet Container Units

**Files**: `infra/quadlet/*.container`, `infra/quadlet/*.network`
**Consumer**: Podman Quadlet generator → systemd user service units
**Deployment**: `sudo cp infra/quadlet/*.container infra/quadlet/*.network /var/lib/secondbrain/.config/containers/systemd/`

### Required Fields per `.container` Unit

| Field | Section | Constraint |
|---|---|---|
| `Image` | `[Container]` | Must exist in `secondbrain` Podman storage |
| `Network` | `[Container]` | Must be `secondbrain.network` for inter-service communication |
| `Restart` | `[Service]` | Must be `always` |
| `WantedBy` | `[Install]` | Must be `default.target` |

### Dependency Contract

- `secondbrain-ollama.container`: no container dependencies; `After=network-online.target`
- `secondbrain-backend.container`: `After=secondbrain-ollama.service`, `Wants=secondbrain-ollama.service`
- Ollama hostname on bridge network: `systemd-secondbrain-ollama` (Quadlet naming: `systemd-<stem>`)

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
| Mount point | `/mnt/PersonalAssistantHub/` | `secondbrain:secondbrain` | `750` |
| fstab fragment | Appended to `/etc/fstab` | (root-owned file) | n/a |

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | All steps completed successfully |
| 1 | Required command not found |
| 2 | Service account creation failed |
| 3 | Image migration failed |
| 4 | Quadlet deployment or container start failed |
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
| Containers healthy | `sudo machinectl shell secondbrain@ /bin/bash -c "systemctl --user is-active secondbrain-ollama.service secondbrain-backend.service"` | Both show `active` |
| Fileshare mounted | `mount \| grep PersonalAssistantHub` | Shows cifs mount |
| Fileshare readable | `ls /mnt/PersonalAssistantHub` | Lists Windows files |
| Isolation enforced | `sudo -u secondbrain ls /home/backstage440` | Permission denied |
| Survives reboot | (reboot + re-run checks) | All checks pass |
