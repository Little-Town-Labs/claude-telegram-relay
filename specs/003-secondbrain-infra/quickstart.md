# Quickstart: SecondBrain Infrastructure Foundation

**Feature**: 003-secondbrain-infra
**Date**: 2026-02-15
**Prerequisites**: sudo access, machine running Ubuntu with Podman 4.9+, systemd 255+

---

## Before You Start

You will need:
- Your Windows machine hostname or IP address
- The SMB share name on the Windows machine
- A Windows username and password with read access to the share

The relay bot (`claude-telegram-relay`) can continue running during this setup.
These steps do not touch the relay process.

---

## Step 1: Install podmgr

```bash
git clone https://github.com/Little-Town-Labs/podman-systemd-manager.git /opt/podmgr
cd /opt/podmgr
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
podmgr --version  # should print a version number
```

---

## Step 2: Create the Service Account

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

## Step 3: Migrate Container Images

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

## Step 4: Initialise the Pod with podmgr

```bash
# Copy the pod config from the repo
cp infra/secondbrain-pod.yaml /var/lib/secondbrain/

# Run podmgr as the service account
sudo machinectl shell secondbrain@ /bin/bash -c "
  source /opt/podmgr/.venv/bin/activate
  podmgr config validate /var/lib/secondbrain/secondbrain-pod.yaml
  podmgr pod init /var/lib/secondbrain/secondbrain-pod.yaml
  podmgr pod start secondbrain
  podmgr pod status secondbrain
"
```

**Expected output**: All containers show `running` status within 90 seconds.
If `ollama` takes longer (model loading), wait up to 2 minutes before checking.

---

## Step 5: Remove Old Containers from Your Account

```bash
# Stop and remove the old containers from backstage440's storage
podman rm -f secondbrain-backend secondbrain-ollama 2>/dev/null
podman pod rm -f 2>/dev/null  # removes the infra container

# Optionally remove the locally-built image from your account too
podman rmi localhost/secondbrain/backend:latest 2>/dev/null
```

---

## Step 6: Mount the Windows Fileshare

```bash
# Install cifs-utils if not already installed
sudo apt install -y cifs-utils

# Create the mount point
sudo mkdir -p /mnt/fileshare
sudo chown secondbrain:secondbrain /mnt/fileshare

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
echo "//WINDOWS-HOST/SHARE-NAME /mnt/fileshare cifs credentials=/etc/samba/credentials.secondbrain,uid=$SBUID,gid=$SBGID,file_mode=0640,dir_mode=0750,soft,_netdev,x-systemd.automount,nofail 0 0" \
  | sudo tee -a /etc/fstab

# Test the mount
sudo mount -a
ls /mnt/fileshare  # should list files from Windows share
```

---

## Step 7: Verify Everything Survives a Reboot

```bash
sudo reboot
# After reboot, log back in as backstage440

# Check containers are running as secondbrain
sudo machinectl shell secondbrain@ /bin/bash -c "
  source /opt/podmgr/.venv/bin/activate
  podmgr pod status secondbrain
"

# Check fileshare is mounted
ls /mnt/fileshare
mount | grep fileshare
```

---

## Troubleshooting

**Containers not starting after reboot**:
```bash
# Check systemd user service status
sudo machinectl shell secondbrain@ /bin/bash -c \
  "systemctl --user status podmgr-secondbrain.service"

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
sudo journalctl -u mnt-fileshare.mount -n 50
# Common cause: Windows machine offline or share name incorrect
```

**Container health check failing**:
```bash
sudo machinectl shell secondbrain@ /bin/bash -c "
  source /opt/podmgr/.venv/bin/activate
  podmgr health status secondbrain-ollama
  podmgr service logs podmgr-secondbrain-ollama --lines 50
"
```
