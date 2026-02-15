# Data Model: SecondBrain Infrastructure Foundation

**Feature**: 003-secondbrain-infra
**Date**: 2026-02-15

---

## Overview

This feature has no application data model (no database, no JSON files).
The "data" is configuration — files that define how the system is structured.
This document describes the configuration schema for each artifact.

---

## Entity 1: Service Account (`secondbrain`)

**Type**: Linux system user

| Attribute | Value |
|---|---|
| Username | `secondbrain` |
| UID | Assigned by `useradd --system` (< 1000) |
| GID | Same as UID (auto-created group) |
| Home directory | `/var/lib/secondbrain` |
| Shell | `/usr/sbin/nologin` |
| Linger | Enabled (`loginctl enable-linger secondbrain`) |
| subuid range | `100000:65536` (in `/etc/subuid`) |
| subgid range | `100000:65536` (in `/etc/subgid`) |

**Owned paths**:
- `/var/lib/secondbrain/` — home and service data
- `/var/lib/secondbrain/.config/systemd/user/` — systemd user units
- `/var/lib/secondbrain/.local/share/containers/` — Podman image storage
- `/mnt/PersonalAssistantHub/` — SMB mount point (owned, read-only by default)

---

## Entity 2: Pod Configuration (podmgr YAML)

**Type**: YAML file committed to repository
**Path**: `infra/secondbrain-pod.yaml`

**Schema**:

```yaml
name: secondbrain
restart_policy: always

services:
  - name: ollama
    image: docker.io/ollama/ollama:latest
    volumes:
      - /var/lib/secondbrain/ollama:/root/.ollama
    health_check:
      type: http
      endpoint: /
      port: 11434
      interval: 30
      timeout: 10
      retries: 3

  - name: backend
    image: localhost/secondbrain/backend:latest
    depends_on:
      - ollama
    environment:
      OLLAMA_URL: http://localhost:11434
    volumes:
      - /mnt/PersonalAssistantHub:/mnt/PersonalAssistantHub:ro
    health_check:
      type: http
      endpoint: /health
      port: 8080          # [VERIFY: confirm backend port]
      interval: 30
      timeout: 10
      retries: 3

```

**Notes**:
- The backend port (8080) must be verified against the actual container definition
  before implementation. Check with: `podman inspect secondbrain-backend | grep -i port`

---

## Entity 3: SMB Credentials File

**Type**: Plain text secrets file — NOT committed to repository
**Path**: `/etc/samba/credentials.secondbrain`
**Permissions**: `600`, owner `root:root`

```
username=<WINDOWS_USERNAME>
password=<WINDOWS_PASSWORD>
domain=WORKGROUP
```

**Template only**: Actual values are operator-supplied at setup time.
A `.gitignore` entry MUST ensure this path is never accidentally committed.

---

## Entity 4: fstab Mount Entry

**Type**: System configuration line — committed to repository as a template
**Path**: `infra/fstab.fragment` (template with placeholders)

```
//WINDOWS-HOST/SHARE-NAME /mnt/PersonalAssistantHub cifs credentials=/etc/samba/credentials.secondbrain,uid=secondbrain,gid=secondbrain,file_mode=0640,dir_mode=0750,soft,_netdev,x-systemd.automount,nofail 0 0
```

Operator replaces `WINDOWS-HOST` and `SHARE-NAME` at setup time and appends
the line to `/etc/fstab`.

---

## Entity 5: Setup Script

**Type**: Bash script — committed to repository
**Path**: `infra/setup.sh`

Idempotent script that performs all one-time setup steps in order:
1. Install `cifs-utils` if not present
2. Create `secondbrain` service account if not present
3. Add subuid/subgid mappings if not present
4. Enable linger
5. Create mount point `/mnt/PersonalAssistantHub`
6. Prompt operator for SMB credentials and write credentials file
7. Remind operator to append fstab fragment and run `sudo mount -a`

---

## State Transitions

```
[Not set up]
     │ run infra/setup.sh
     ▼
[Service account created, linger enabled]
     │ podman save + machinectl load images
     ▼
[Images migrated to secondbrain storage]
     │ machinectl shell → podmgr pod init secondbrain-pod.yaml
     ▼
[systemd user units generated]
     │ machinectl shell → podmgr pod start secondbrain
     ▼
[Containers running under secondbrain, health checks active]
     │ append fstab fragment + sudo mount -a
     ▼
[Full stack running: containers healthy, fileshare mounted]
```
