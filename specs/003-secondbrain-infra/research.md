# Research: SecondBrain Infrastructure Foundation

**Feature**: 003-secondbrain-infra
**Date**: 2026-02-15

---

## Decision 1: Container Management Tool — podmgr vs Raw Quadlet

**Decision**: Use podmgr (Little-Town-Labs/podman-systemd-manager) for container
management, which generates Podman Quadlet files internally.

**Rationale**: podmgr provides a simpler YAML interface than raw Quadlet INI files.
It handles health check integration, dependency ordering, and systemd registration
through a single `podmgr pod init` + `podmgr pod start` workflow. Since the machine
already has Podman 4.9.3 (Quadlet-compatible) and podmgr requires Podman 4.0+,
the stack is compatible.

**Alternatives considered**:
- Raw Quadlet INI files: Lower-level, more verbose, but no health check daemon;
  health checks in Quadlet are container-level only (HealthCmd), not service-level
  restart policies. Rejected in favour of podmgr's richer health monitoring.
- docker-compose: Not suitable for rootless Podman + systemd integration. Rejected.

**Underlying mechanism**: podmgr generates `.service` files and optionally Quadlet
`.container` files placed in `~/.config/systemd/user/`. systemd user daemon manages
the lifecycle.

---

## Decision 2: Service Account Setup — machinectl vs sudo -u

**Decision**: Use `machinectl shell secondbrain@` for running commands as the
`secondbrain` service account, NOT `sudo -u secondbrain`.

**Rationale**: `sudo -u` does not set up `XDG_RUNTIME_DIR`, which Podman requires
for rootless operation. `machinectl shell` correctly initialises the full user
session including `XDG_RUNTIME_DIR=/run/user/<UID>`. This is the Red Hat/Podman
recommended approach for service accounts with no login shell.

**Required one-time setup**:
```bash
sudo useradd --system --create-home --home-dir /var/lib/secondbrain \
  --shell /usr/sbin/nologin secondbrain
echo "secondbrain:100000:65536" | sudo tee -a /etc/subuid
echo "secondbrain:100000:65536" | sudo tee -a /etc/subgid
sudo loginctl enable-linger secondbrain
```

**Why subuid/subgid are required**: Rootless Podman uses user namespace mappings
to isolate container UIDs from host UIDs. Without entries in `/etc/subuid` and
`/etc/subgid`, the service account cannot run containers.

**Linger**: `loginctl enable-linger` tells systemd to start and maintain the user's
systemd session at boot, even when no interactive session exists. Without this,
all user services stop when the operator logs out.

---

## Decision 3: Container Image Migration Strategy

**Decision**: Export locally-built images from `backstage440` using `podman save`,
then import into `secondbrain` using `machinectl shell`. Re-pull public images
directly as `secondbrain`.

**Rationale**: Podman storage is per-user. There is no "move" operation.
`podman save` creates a portable tar archive; `podman load` imports it into the
target user's storage.

**Concrete commands**:
```bash
# As backstage440 — export locally-built images
podman save localhost/secondbrain/backend:latest -o /tmp/sb-backend.tar
podman save localhost/secondbrain/discord:latest -o /tmp/sb-discord.tar
chmod 644 /tmp/sb-backend.tar /tmp/sb-discord.tar

# As secondbrain — import and pull
sudo machinectl shell secondbrain@ /bin/bash -c \
  "podman load -i /tmp/sb-backend.tar && \
   podman load -i /tmp/sb-discord.tar && \
   podman pull docker.io/ollama/ollama:latest"

# Clean up
rm /tmp/sb-backend.tar /tmp/sb-discord.tar
```

**After migration**: Remove old containers from `backstage440`'s storage:
```bash
podman rm -f secondbrain-backend secondbrain-ollama secondbrain-discord 44c994267583-infra 2>/dev/null
podman rmi localhost/secondbrain/backend:latest localhost/secondbrain/discord:latest 2>/dev/null
```

---

## Decision 4: SMB/CIFS Mount Configuration

**Decision**: Mount via `/etc/fstab` with `soft,_netdev,nofail,x-systemd.automount`
options. Credentials in `/etc/samba/credentials.secondbrain` owned by root (600).

**Rationale**:
- `soft`: Processes receive an immediate error if the server is unreachable, instead
  of hanging indefinitely. This satisfies FR-015.
- `nofail`: Boot succeeds even if Windows machine is offline. Satisfies FR-014.
- `_netdev`: systemd waits for the network to be up before attempting the mount.
- `x-systemd.automount`: Lazy mounting — only connects when first accessed.
  Combines with `nofail` to avoid blocking the relay at startup.
- `uid=secondbrain,gid=secondbrain`: All mounted files appear owned by the service
  account on the Linux side. Satisfies FR-011 (accessible by `secondbrain`).

**fstab entry**:
```
//WINDOWS-HOST/SHARE-NAME /mnt/fileshare cifs \
  credentials=/etc/samba/credentials.secondbrain,\
  uid=secondbrain,gid=secondbrain,\
  file_mode=0640,dir_mode=0750,\
  soft,_netdev,x-systemd.automount,nofail 0 0
```

**Credentials file** (`/etc/samba/credentials.secondbrain`, chmod 600, owner root):
```
username=WINDOWS_USERNAME
password=WINDOWS_PASSWORD
domain=WORKGROUP
```

**Required package**: `sudo apt install cifs-utils`

**Mount point ownership**:
```bash
sudo mkdir -p /mnt/fileshare
sudo chown secondbrain:secondbrain /mnt/fileshare
```

---

## Decision 5: podmgr Health Check Types per Container

| Container | Health Check Type | Rationale |
|---|---|---|
| `secondbrain-ollama` | HTTP `GET /` on port 11434 | Ollama exposes REST API; HTTP check confirms it's serving |
| `secondbrain-backend` | HTTP on its API port | Backend is an HTTP service |
| `secondbrain-discord` | Command: process liveness | Discord bot has no HTTP endpoint; check process is alive |

**Dependency order**:
`secondbrain-ollama` → `secondbrain-backend` → `secondbrain-discord`

Ollama must be healthy before the backend starts (backend calls Ollama).
Backend must be healthy before Discord bot starts (Discord bot uses backend API).

---

## Resolved Unknowns

All NEEDS CLARIFICATION items from spec resolved:

| Item | Resolution |
|---|---|
| Windows server hostname/IP | Runtime secret — operator provides at setup |
| SMB share name | Runtime secret — operator provides at setup |
| SMB credentials | Runtime secret — stored in credentials file, not in repo |
| secondbrain backend API port | [NEEDS OPERATOR INPUT: check container definition] |
| Discord bot health check command | `podman healthcheck run secondbrain-discord` or process check |
