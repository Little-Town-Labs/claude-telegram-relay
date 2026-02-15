# Feature Specification: SecondBrain Infrastructure Foundation

**Feature Branch**: `003-secondbrain-infra`
**Created**: 2026-02-15
**Status**: Draft
**Input**: Phase 1 infrastructure — service account, podmgr container management, Windows fileshare mount

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Isolated Service Account (Priority: P1)

As the system operator, I want the SecondBrain containers to run
under a dedicated, non-login service account so that a container
failure or compromise cannot affect my personal user files or
credentials.

**Why this priority**: Without isolation, all containers run as
`backstage440`, sharing access to the user's home directory,
SSH keys, and credentials. This is the security and operational
foundation everything else builds on.

**Independent Test**: Create the service account, set linger, and
confirm that a process launched as `secondbrain` has no access to
`/home/backstage440` and survives the user logging out.

**Acceptance Scenarios**:

1. **Given** the machine is running, **When** the `secondbrain`
   service account is created, **Then** it has no login shell, no
   password, a dedicated home directory, and cannot access
   `/home/backstage440`.
2. **Given** the service account exists, **When** linger is enabled,
   **Then** services under `secondbrain` continue running after
   `backstage440` logs out.
3. **Given** the service account exists, **When** a container
   escapes its sandbox, **Then** it has access only to the service
   account's dedicated directory and mounted paths.

---

### User Story 2 - Managed Container Lifecycle (Priority: P2)

As the system operator, I want the SecondBrain containers
(`secondbrain-backend`, `secondbrain-ollama`)
to start automatically on boot, restart on failure, and be managed
through a single declarative configuration so that I never need
to manually start or debug a downed container.

**Why this priority**: The two existing named services (ollama,
backend) are currently in "Created" or "Exited" state
with no auto-start or health checks.
Reliable container management is required before any feature that
depends on SecondBrain being available can be built.

**Independent Test**: Reboot the machine and confirm all containers
reach a healthy state without any manual intervention. Then kill
one container process and confirm it restarts within 30 seconds.

**Acceptance Scenarios**:

1. **Given** the machine reboots, **When** systemd starts,
   **Then** all three SecondBrain services reach a running state
   within 90 seconds without manual intervention.
2. **Given** a container is running, **When** the container
   process crashes, **Then** the container restarts automatically
   within 30 seconds.
3. **Given** containers have dependencies (backend depends on ollama),
   **When** starting the stack, **Then** dependent containers wait
   for their dependencies to become healthy before starting.
4. **Given** a container is unhealthy, **When** health checks fail
   3 consecutive times, **Then** the container restarts and an
   alert is written to the system log.
5. **Given** the full stack is running, **When** the operator runs
   a single command, **Then** status of all containers and their
   health is displayed.

---

### User Story 3 - Windows Fileshare Access (Priority: P3)

As the AI assistant user, I want the assistant to be able to
read files from my Windows machine's shared folder so that I
can ask questions about documents, notes, and files without
manually copying them to the Linux machine.

**Why this priority**: File access is a key capability goal but
depends on the service account (P1) existing first so the mount
is owned by the correct user. It is lower priority than the
container lifecycle because the assistant is still useful
without file access.

**Independent Test**: Mount the Windows share to a local path,
confirm `secondbrain` service account can read files from it,
and confirm the mount persists across reboots.

**Acceptance Scenarios**:

1. **Given** the Windows machine is on the network, **When** the
   system boots, **Then** the fileshare is automatically mounted
   and accessible within 90 seconds.
2. **Given** the share is mounted, **When** a file is read from
   the mount path, **Then** the contents are returned correctly
   and within 500ms for files under 1MB.
3. **Given** the service account, **When** it accesses the mount,
   **Then** it can read files but cannot write unless explicitly
   configured.
4. **Given** the Windows machine is offline, **When** the system
   boots, **Then** the mount fails gracefully without blocking
   the boot process or crashing the relay.
5. **Given** the mount was connected and the network drops,
   **When** the mount becomes unavailable, **Then** processes
   using the mount receive a clear error rather than hanging
   indefinitely.

---

### Edge Cases

- What happens when the `secondbrain` service account already exists
  (e.g., partial previous setup)?
- What happens if podmgr is not installed when the operator tries
  to initialize the pod?
- What happens if the Windows machine changes its IP address or
  hostname?
- What happens if the SMB share credentials change?
- What happens if a container's health check passes but the service
  inside is actually degraded (false positive)?
- What happens if `loginctl enable-linger` is not set and the
  operator logs out — does the system fail silently?

## Requirements *(mandatory)*

### Functional Requirements

**Service Account**

- **FR-001**: The system MUST provide a dedicated non-login service
  account (`secondbrain`) with its own home directory under
  `/var/lib/secondbrain`.
- **FR-002**: The service account MUST be configured with linger
  enabled so its user-level services survive operator logout.
- **FR-003**: The service account MUST NOT be granted access to
  `/home/backstage440` or any other user home directory.
- **FR-004**: All SecondBrain container storage and configuration
  MUST be owned by the `secondbrain` account, not `backstage440`.

**Container Management**

- **FR-005**: Both SecondBrain services (`ollama`, `backend`) MUST be
  defined in a declarative podmgr YAML configuration committed to the
  repository. (A pod-infra container is created automatically by Podman
  and is not operator-managed.)
- **FR-006**: The podmgr configuration MUST define health checks for
  each container appropriate to its role (HTTP, TCP, or command-based).
- **FR-007**: Containers MUST start in dependency order: `ollama`
  before `backend` (backend calls Ollama at startup).
- **FR-008**: The pod MUST be registered as a systemd user service
  under the `secondbrain` account so it starts at boot.
- **FR-009**: Any container that fails a health check 3 consecutive
  times MUST be automatically restarted.
- **FR-010**: The operator MUST be able to view the status of all
  containers with a single command.

**Windows Fileshare**

- **FR-011**: The Windows fileshare MUST be mounted at a stable,
  documented path (e.g., `/mnt/fileshare`) accessible by the
  `secondbrain` service account.
- **FR-012**: The mount MUST be configured to mount automatically
  at boot via `/etc/fstab` or equivalent persistent mechanism.
- **FR-013**: Mount credentials MUST be stored in a dedicated
  credentials file with permissions restricted to root and the
  `secondbrain` account.
- **FR-014**: The mount MUST use `nofail` or equivalent option so
  an offline Windows machine does not block the system boot.
- **FR-015**: The mount MUST enforce a read timeout so that a
  stalled network connection does not cause processes to hang
  indefinitely.

### Key Entities

- **Service Account** (`secondbrain`): The non-login Linux user that
  owns all SecondBrain processes, containers, and data. Has a home
  directory, linger enabled, and no shell access.
- **Pod Configuration**: The podmgr YAML file(s) defining all four
  containers, their health checks, dependencies, resource limits,
  and volume mounts. Version-controlled.
- **Mount Point**: The stable filesystem path where the Windows
  fileshare is accessible. Owned by `secondbrain`, read-only by
  default.
- **Credentials File**: A root-readable file containing SMB username
  and password for the Windows share. Not committed to git.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a full machine reboot, both SecondBrain
  services reach a running and healthy state without any manual
  operator intervention within 90 seconds.
- **SC-002**: When any SecondBrain container crashes, it recovers
  automatically within 30 seconds without operator action.
- **SC-003**: The Windows fileshare is accessible at its mount
  point within 90 seconds of boot when the Windows machine is
  online.
- **SC-004**: If the Windows machine is offline at boot, the
  system boots successfully and the Telegram relay is operational
  within 120 seconds (fileshare unavailability does not block
  the relay).
- **SC-005**: The entire infrastructure stack can be rebuilt from
  a fresh machine using only the repository contents and a single
  documented setup procedure — no manual steps from memory required.
- **SC-006**: The `secondbrain` service account has no ability to
  read or modify files in `/home/backstage440`, verifiable by
  attempting file access as that user.

## Assumptions

- The Windows machine is on the same local network and accessible
  via SMB (CIFS) protocol.
- SMB credentials (username, password, share name) are available
  from the operator — these are not stored in the repository.
- podmgr will be installed from the `Little-Town-Labs/podman-systemd-manager`
  repository before this feature's tasks are executed.
- The machine runs Ubuntu with systemd 255+ and Podman 4.9+
  (confirmed compatible with Quadlet and podmgr).
- The `backstage440` user has sudo access for the one-time setup
  steps (account creation, fstab, linger); ongoing operations
  run without sudo.
