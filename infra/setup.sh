#!/usr/bin/env bash
# ==============================================================
# infra/setup.sh — SecondBrain Infrastructure Setup
# ==============================================================
# Idempotent one-time setup for the SecondBrain service account,
# Quadlet container deployment, and Windows fileshare mount.
#
# Run as: backstage440 (with sudo access)
# Re-run safely: all steps check current state before acting.
#
# Exit codes:
#   0 — All steps completed successfully
#   1 — Required command not found
#   2 — Service account creation failed
#   3 — Image migration failed
#   4 — Quadlet deployment or container start failed
#   5 — Mount test failed (fatal only if --strict)
# ==============================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

print_green()  { echo -e "${GREEN}  ✓ $*${NC}"; }
print_yellow() { echo -e "${YELLOW}  ⚠ $*${NC}"; }
print_red()    { echo -e "${RED}  ✗ $*${NC}"; }
print_step()   { echo -e "\n${BOLD}▶ $*${NC}"; }
already_done() { echo "  already done, skipping"; }

# ── Smoke test results (populated at runtime) ──────────────────
RESULT_US1_ISOLATION="SKIP"
RESULT_US2_CONTAINERS="SKIP"
RESULT_US3_MOUNT="SKIP"

# ── Script location (used to find sibling files) ───────────────
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ==============================================================
# --help
# ==============================================================
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage: bash infra/setup.sh [--help]

Sets up the SecondBrain infrastructure on this machine.
Run as backstage440 with sudo access.

Prerequisites (must be present before running):
  - podman    (4.0+)
  - systemctl
  - loginctl
  - machinectl

Operator inputs prompted during run:
  - Windows hostname or IP address
  - SMB share name
  - Windows username
  - Windows password
  - Domain (default: WORKGROUP)

Exit codes:
  0 — All steps completed successfully
  1 — Required command not found
  2 — Service account creation failed
  3 — Image migration failed
  4 — Quadlet deployment or container start failed
  5 — Mount test failed
EOF
  exit 0
fi

# ==============================================================
# Phase 1: Prerequisites
# ==============================================================
print_step "Checking prerequisites..."

check_prerequisites() {
  local missing=0
  for cmd in podman systemctl loginctl machinectl; do
    if ! command -v "$cmd" &>/dev/null; then
      print_red "Required command not found: $cmd"
      missing=1
    else
      print_green "$cmd  →  $(command -v "$cmd")"
    fi
  done
  if [[ $missing -eq 1 ]]; then
    echo ""
    print_red "Install missing commands and re-run."
    print_yellow "  machinectl is provided by: sudo apt install -y systemd-container"
    exit 1
  fi
}

check_prerequisites


# ==============================================================
# Phase 3 (US1): Service Account
# ==============================================================
print_step "Creating secondbrain service account..."

# T006 — Account creation
if id secondbrain &>/dev/null; then
  already_done
  print_green "secondbrain exists  →  $(id secondbrain)"
else
  if sudo useradd --system --create-home \
       --home-dir /var/lib/secondbrain \
       --shell /usr/sbin/nologin secondbrain; then
    print_green "Created secondbrain  →  UID $(id -u secondbrain)"
  else
    print_red "useradd failed"
    exit 2
  fi
fi

# T007 — subuid/subgid mappings
print_step "Configuring subuid/subgid mappings..."

if grep -q "^secondbrain:" /etc/subuid 2>/dev/null; then
  already_done
  print_green "subuid entry present: $(grep '^secondbrain:' /etc/subuid)"
else
  echo "secondbrain:100000:65536" | sudo tee -a /etc/subuid > /dev/null
  print_green "Added secondbrain:100000:65536 to /etc/subuid"
fi

if grep -q "^secondbrain:" /etc/subgid 2>/dev/null; then
  already_done
  print_green "subgid entry present: $(grep '^secondbrain:' /etc/subgid)"
else
  echo "secondbrain:100000:65536" | sudo tee -a /etc/subgid > /dev/null
  print_green "Added secondbrain:100000:65536 to /etc/subgid"
fi

# T008 — Enable linger
print_step "Enabling linger for secondbrain..."

sudo loginctl enable-linger secondbrain
if loginctl show-user secondbrain 2>/dev/null | grep -q "Linger=yes"; then
  print_green "Linger=yes confirmed"
else
  print_yellow "Linger status unconfirmed — may need an active session to verify"
fi

# T009 — Isolation smoke test (print-only, non-fatal)
print_step "Isolation smoke test..."

if sudo -u secondbrain ls /home/backstage440 2>/dev/null; then
  RESULT_US1_ISOLATION="FAIL"
  print_red "FAIL: secondbrain can read /home/backstage440 — check directory permissions"
else
  RESULT_US1_ISOLATION="PASS"
  print_green "PASS: secondbrain cannot read /home/backstage440 (access denied as expected)"
fi

# ==============================================================
# Phase 4 (US2): Container Discovery & Migration
# ==============================================================

# T010 — Discover backend port
print_step "Discovering container configuration..."

BACKEND_PORT="8080"  # default; overridden below if detectable

detected_port=$(podman inspect secondbrain-backend 2>/dev/null \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ports = d[0]['Config'].get('ExposedPorts', {})
    if ports:
        print(list(ports.keys())[0].split('/')[0])
    else:
        print('unknown')
except Exception:
    print('unknown')
" 2>/dev/null || echo "unknown")

if [[ "$detected_port" != "unknown" && "$detected_port" =~ ^[0-9]+$ ]]; then
  BACKEND_PORT="$detected_port"
  print_green "Detected backend port: $BACKEND_PORT"
else
  print_yellow "Backend port not detected from running container; using default: $BACKEND_PORT"
  print_yellow "Verify the port in infra/secondbrain.yaml before proceeding"
fi

# T012 — Export images from backstage440 storage
print_step "Checking images in secondbrain storage..."

backend_in_sb=$(sudo machinectl shell secondbrain@ /bin/bash -c \
  "podman images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -c 'backend' || echo 0" \
  2>/dev/null | tail -1 || echo "0")

if [[ "$backend_in_sb" -gt 0 ]]; then
  already_done
  print_green "backend image already present in secondbrain storage"
else
  # Export locally-built backend image
  exported_backend=false

  if podman image exists localhost/secondbrain/backend:latest 2>/dev/null; then
    print_step "Exporting backend image..."
    podman save localhost/secondbrain/backend:latest -o /tmp/sb-backend.tar
    chmod 644 /tmp/sb-backend.tar
    exported_backend=true
    print_green "Saved to /tmp/sb-backend.tar"
  else
    print_yellow "localhost/secondbrain/backend:latest not found — skipping export"
  fi

  # T013 — Import into secondbrain storage
  print_step "Importing images into secondbrain storage..."

  import_cmd=""
  $exported_backend && import_cmd+="podman load -i /tmp/sb-backend.tar && "
  import_cmd+="podman pull docker.io/ollama/ollama:latest && podman images"

  if sudo machinectl shell secondbrain@ /bin/bash -c "$import_cmd"; then
    print_green "Images imported into secondbrain storage"
    rm -f /tmp/sb-backend.tar
    print_green "Temporary tar file removed"
  else
    print_red "Image import failed"
    rm -f /tmp/sb-backend.tar
    exit 3
  fi
fi

# T014 — Deploy Quadlet units
print_step "Deploying Quadlet container units..."

QUADLET_DIR="$SCRIPT_DIR/quadlet"
if [[ ! -d "$QUADLET_DIR" ]]; then
  print_red "Quadlet directory not found: $QUADLET_DIR"
  print_red "Ensure infra/quadlet/ exists in the repository"
  exit 4
fi

# Create Quadlet config directory, volume directories, and copy units
SYSTEMD_DIR="/var/lib/secondbrain/.config/containers/systemd"
sudo mkdir -p "$SYSTEMD_DIR"
sudo mkdir -p /var/lib/secondbrain/ollama
sudo cp "$QUADLET_DIR"/*.container "$QUADLET_DIR"/*.network "$SYSTEMD_DIR"/
sudo chown -R secondbrain:secondbrain /var/lib/secondbrain/.config /var/lib/secondbrain/ollama
print_green "Quadlet units copied to $SYSTEMD_DIR"

# Reload systemd so Quadlet generator creates the service units
sudo machinectl shell secondbrain@ /bin/bash -c \
  "systemctl --user daemon-reload"
print_green "systemd daemon reloaded — Quadlet units registered"

# T015 — Start services and poll until all running
print_step "Starting services..."

sudo machinectl shell secondbrain@ /bin/bash -c \
  "systemctl --user start secondbrain-ollama secondbrain-backend" || true

timeout=90
elapsed=0
print_yellow "Waiting for all services to reach 'running' state (up to ${timeout}s)..."

while [[ $elapsed -lt $timeout ]]; do
  running_count=$(sudo machinectl shell secondbrain@ /bin/bash -c \
    "systemctl --user is-active secondbrain-ollama.service secondbrain-backend.service 2>/dev/null | grep -c '^active$'" \
    2>/dev/null | tail -1 || echo "0")

  if [[ "$running_count" -ge 2 ]]; then
    RESULT_US2_CONTAINERS="PASS"
    print_green "PASS: all 2 services running"
    break
  fi

  print_yellow "  ${elapsed}s — active: ${running_count}/2 services..."
  sleep 5
  elapsed=$((elapsed + 5))
done

if [[ "$RESULT_US2_CONTAINERS" != "PASS" ]]; then
  RESULT_US2_CONTAINERS="FAIL"
  print_red "Timeout after ${timeout}s — not all services reached 'running'"
  print_yellow "Diagnose:"
  print_yellow "  sudo machinectl shell secondbrain@ /bin/bash -c 'systemctl --user status secondbrain-pod'"
  exit 4
fi

# T016 — Remove old containers from backstage440 storage
print_step "Removing old containers from backstage440 storage..."

podman rm -f secondbrain-backend secondbrain-ollama 2>/dev/null || true
print_green "Old containers removed"

echo ""
read -rp "  Also remove locally-built images from backstage440 storage? [y/N] " remove_images
if [[ "${remove_images,,}" == "y" ]]; then
  podman rmi localhost/secondbrain/backend:latest 2>/dev/null || true
  print_green "Locally-built images removed from backstage440 storage"
else
  print_yellow "Locally-built images retained in backstage440 storage"
fi

# ==============================================================
# Phase 5 (US3): Windows Fileshare
# ==============================================================

# T018 — Install cifs-utils
print_step "Installing cifs-utils..."

if dpkg -l cifs-utils 2>/dev/null | grep -q "^ii"; then
  already_done
  print_green "cifs-utils already installed"
else
  sudo apt-get install -y cifs-utils
  print_green "cifs-utils installed"
fi

# T019 — Create mount point
print_step "Creating mount point /mnt/PersonalAssistantHub..."

sudo mkdir -p /mnt/PersonalAssistantHub
sudo chown secondbrain:secondbrain /mnt/PersonalAssistantHub
print_green "/mnt/PersonalAssistantHub created and owned by secondbrain"

# T020 — Credentials file
print_step "Configuring SMB credentials..."

CREDS_FILE="/etc/samba/credentials.secondbrain"
SKIP_CREDS=false

if [[ -f "$CREDS_FILE" ]]; then
  echo ""
  read -rp "  $CREDS_FILE already exists. Overwrite? [y/N] " overwrite_creds
  [[ "${overwrite_creds,,}" != "y" ]] && SKIP_CREDS=true
fi

WINDOWS_HOST=""
SHARE_NAME=""

if [[ "$SKIP_CREDS" != "true" ]]; then
  echo ""
  read -rp  "  Windows hostname or IP:  " WINDOWS_HOST
  read -rp  "  SMB share name:          " SHARE_NAME
  read -rp  "  Windows username:        " SMB_USER
  read -rsp "  Windows password:        " SMB_PASS
  echo ""
  read -rp  "  Domain [WORKGROUP]:      " SMB_DOMAIN
  SMB_DOMAIN="${SMB_DOMAIN:-WORKGROUP}"

  if [[ -z "$WINDOWS_HOST" || -z "$SHARE_NAME" || -z "$SMB_USER" || -z "$SMB_PASS" ]]; then
    print_red "hostname, share name, username, and password are all required"
    exit 5
  fi

  sudo mkdir -p /etc/samba
  printf 'username=%s\npassword=%s\ndomain=%s\n' \
    "$SMB_USER" "$SMB_PASS" "$SMB_DOMAIN" \
    | sudo tee "$CREDS_FILE" > /dev/null
  sudo chmod 600 "$CREDS_FILE"
  sudo chown root:root "$CREDS_FILE"
  print_green "Credentials written to $CREDS_FILE (root:root 600)"
else
  print_yellow "Keeping existing credentials file"
fi

# T021 — fstab append
if [[ -n "$WINDOWS_HOST" && -n "$SHARE_NAME" ]]; then
  print_step "Appending mount entry to /etc/fstab..."

  SBUID=$(id -u secondbrain)
  SBGID=$(id -g secondbrain)
  FSTAB_LINE="//${WINDOWS_HOST}/${SHARE_NAME} /mnt/PersonalAssistantHub cifs credentials=${CREDS_FILE},uid=${SBUID},gid=${SBGID},file_mode=0640,dir_mode=0750,soft,_netdev,x-systemd.automount,nofail 0 0"

  if grep -q "/mnt/PersonalAssistantHub" /etc/fstab 2>/dev/null; then
    already_done
    print_yellow "An /mnt/PersonalAssistantHub entry already exists in /etc/fstab — not appending"
    print_yellow "Review /etc/fstab manually to update host/share values if needed"
  else
    echo "$FSTAB_LINE" | sudo tee -a /etc/fstab > /dev/null
    print_green "fstab entry appended"

    sudo mount -a
    if mount | grep -q "/mnt/PersonalAssistantHub"; then
      print_green "/mnt/PersonalAssistantHub is mounted"
    else
      print_yellow "mount -a ran but /mnt/PersonalAssistantHub not in mount output"
      print_yellow "Windows machine may be offline — mount will activate on next access (automount)"
    fi
  fi
else
  print_yellow "Skipping fstab append — no host/share values available"
  print_yellow "Re-run setup.sh or append the fstab line manually using infra/fstab.fragment as a template"
fi

# T022 — Fileshare smoke test
print_step "Fileshare smoke test..."

if ls /mnt/PersonalAssistantHub &>/dev/null; then
  RESULT_US3_MOUNT="PASS"
  print_green "PASS: /mnt/PersonalAssistantHub is accessible"
else
  RESULT_US3_MOUNT="FAIL"
  print_yellow "FAIL: /mnt/PersonalAssistantHub is not accessible"
  print_yellow "  Is the Windows machine online? Try: ping ${WINDOWS_HOST:-<WINDOWS-HOST>}"
  print_yellow "  Check: sudo journalctl -u mnt-fileshare.mount -n 50"
fi

# ==============================================================
# Phase 6: Final Summary
# ==============================================================
echo ""
echo "============================================================"
echo "  SecondBrain Infrastructure Setup — Results"
echo "============================================================"
printf "  %-40s  %s\n" "US1: secondbrain isolation" "$RESULT_US1_ISOLATION"
printf "  %-40s  %s\n" "US2: containers running"    "$RESULT_US2_CONTAINERS"
printf "  %-40s  %s\n" "US3: fileshare accessible"  "$RESULT_US3_MOUNT"
echo "============================================================"
echo ""

all_pass=true
for result in "$RESULT_US1_ISOLATION" "$RESULT_US2_CONTAINERS" "$RESULT_US3_MOUNT"; do
  [[ "$result" == "FAIL" ]] && all_pass=false
done

if $all_pass; then
  print_green "All smoke tests passed."
  echo ""
  echo "  Verify after reboot:"
  echo "    sudo machinectl shell secondbrain@ /bin/bash -c \\"
  echo "      'systemctl --user status secondbrain-ollama secondbrain-backend'"
  echo "    ls /mnt/PersonalAssistantHub"
else
  print_yellow "Setup completed with warnings — review FAIL/SKIP items above."
fi

exit 0
