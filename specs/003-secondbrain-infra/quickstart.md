# Quickstart: SecondBrain Infrastructure Foundation

**Feature**: 003-secondbrain-infra
**Date**: 2026-02-15
**Prerequisites**: sudo access, machine running Ubuntu with Podman 4.9+, systemd 255+

---

## Before You Start

Install required system packages before running any steps:

```bash
sudo apt install -y systemd-container cifs-utils
```

- `systemd-container` — provides `machinectl`, required for all container operations under the `secondbrain` account
- `cifs-utils` — required for the Windows fileshare mount (Step 6)

You will also need:
- Your Windows machine hostname or IP address
- The SMB share name on the Windows machine
- A Windows username and password with read access to the share

The relay bot (`claude-telegram-relay`) can continue running during this setup.
These steps do not touch the relay process.

---

## Step 1: Create the Service Account

```bash
# Create the account
sudo useradd --system --create-home \
  --home-dir /var/lib/secondbrain \
  --shell /usr/sbin/nologin \
  secondbrain

# Enable rootless container support
echo "secondbrain:100000:65536" | sudo tee -a /etc/subuid
echo "secondbrain:100000:65536" | sudo tee -a /etc/subgid

# Enable linger so services survive logout
sudo loginctl enable-linger secondbrain

# Verify
id secondbrain
sudo loginctl show-user secondbrain | grep Linger
```

---

## Step 2: Migrate Container Images

```bash
# Export locally-built images from your account
podman save localhost/secondbrain/backend:latest -o /tmp/sb-backend.tar
chmod 644 /tmp/sb-backend.tar

# Import into secondbrain's storage + pull the public Ollama image
sudo machinectl shell secondbrain@ /bin/bash -c "
  podman load -i /tmp/sb-backend.tar
  podman pull docker.io/ollama/ollama:latest
  podman images
"

# Clean up temp file
rm /tmp/sb-backend.tar
```

---

## Step 3: Deploy Quadlet Units

```bash
# Create config directory, volume directories, and copy units
sudo mkdir -p /var/lib/secondbrain/.config/containers/systemd
sudo mkdir -p /var/lib/secondbrain/ollama
sudo cp infra/quadlet/*.container infra/quadlet/*.network \
  /var/lib/secondbrain/.config/containers/systemd/
sudo chown -R secondbrain:secondbrain /var/lib/secondbrain/.config /var/lib/secondbrain/ollama

# Reload systemd so Quadlet generates the service units
sudo machinectl shell secondbrain@ /bin/bash -c "systemctl --user daemon-reload"

# Start both services
sudo machinectl shell secondbrain@ /bin/bash -c \
  "systemctl --user start secondbrain-ollama secondbrain-backend"

# Check status
sudo machinectl shell secondbrain@ /bin/bash -c \
  "systemctl --user status secondbrain-ollama secondbrain-backend"
```

**Expected output**: Both services show `active (running)` within 90 seconds.
If `ollama` takes longer (model loading), wait up to 2 minutes before checking.

---

## Step 4: Remove Old Containers from Your Account

```bash
# Stop and remove the old containers from backstage440's storage
podman rm -f secondbrain-backend secondbrain-ollama 2>/dev/null
podman pod rm -f 2>/dev/null  # removes the infra container

# Optionally remove the locally-built image from your account too
podman rmi localhost/secondbrain/backend:latest 2>/dev/null
```

---

## Step 5: Mount the Windows Fileshare

```bash
# Install cifs-utils if not already installed
sudo apt install -y cifs-utils

# Create the mount point
sudo mkdir -p /mnt/PersonalAssistantHub
sudo chown secondbrain:secondbrain /mnt/PersonalAssistantHub

# Create the credentials file (fill in your values)
sudo tee /etc/samba/credentials.secondbrain > /dev/null << 'EOF'
username=YOUR_WINDOWS_USERNAME
password=YOUR_WINDOWS_PASSWORD
domain=WORKGROUP
EOF
sudo chmod 600 /etc/samba/credentials.secondbrain
sudo chown root:root /etc/samba/credentials.secondbrain

# Get the secondbrain UID for fstab
SBUID=$(id -u secondbrain)
SBGID=$(id -g secondbrain)
echo "secondbrain UID=$SBUID GID=$SBGID"

# Add mount to fstab (replace WINDOWS-HOST and SHARE-NAME)
echo "//WINDOWS-HOST/SHARE-NAME /mnt/PersonalAssistantHub cifs credentials=/etc/samba/credentials.secondbrain,uid=$SBUID,gid=$SBGID,file_mode=0640,dir_mode=0750,soft,_netdev,x-systemd.automount,nofail 0 0" \
  | sudo tee -a /etc/fstab

# Test the mount
sudo mount -a
ls /mnt/PersonalAssistantHub  # should list files from Windows share
```

---

## Step 6: Verify Everything Survives a Reboot

```bash
sudo reboot
# After reboot, log back in as backstage440

# Check containers are running as secondbrain
sudo machinectl shell secondbrain@ /bin/bash -c \
  "systemctl --user status secondbrain-ollama secondbrain-backend"

# Check fileshare is mounted
ls /mnt/PersonalAssistantHub
mount | grep PersonalAssistantHub
```

---

## Troubleshooting

**Containers not starting after reboot**:
```bash
# Check systemd user service status
sudo machinectl shell secondbrain@ /bin/bash -c \
  "systemctl --user status secondbrain-ollama secondbrain-backend"

# Check linger is still set
sudo loginctl show-user secondbrain | grep Linger
```

**"XDG_RUNTIME_DIR not set" error**:
```bash
# Always use machinectl shell, not sudo -u, for podman commands
sudo machinectl shell secondbrain@ /bin/bash -c "podman ps"
```

**SMB mount not appearing**:
```bash
sudo journalctl -u mnt-PersonalAssistantHub.mount -n 50
# Common cause: Windows machine offline or share name incorrect
```

**Container logs**:
```bash
sudo machinectl shell secondbrain@ /bin/bash -c \
  "journalctl --user -u secondbrain-ollama.service -n 50"
sudo machinectl shell secondbrain@ /bin/bash -c \
  "journalctl --user -u secondbrain-backend.service -n 50"
```
