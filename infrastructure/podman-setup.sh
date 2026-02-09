#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

POD_NAME="secondbrain-relay"
CONTAINER_NAME="relay"
IMAGE_NAME="claude-telegram-relay"
DATA_VOLUME="secondbrain_data"

echo "=== SecondBrain Relay Pod Setup ==="

# Check for .env file
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "Error: $SCRIPT_DIR/.env not found"
  echo "Copy .env.example to .env and fill in your credentials:"
  echo "  cp $SCRIPT_DIR/.env.example $SCRIPT_DIR/.env"
  exit 1
fi

# Create data volume if needed
if ! podman volume exists "$DATA_VOLUME" 2>/dev/null; then
  echo "Creating data volume: $DATA_VOLUME"
  podman volume create "$DATA_VOLUME"
fi

# Build container image
echo "Building container image: $IMAGE_NAME"
podman build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Containerfile" "$PROJECT_DIR"

# Remove existing pod if present
if podman pod exists "$POD_NAME" 2>/dev/null; then
  echo "Removing existing pod: $POD_NAME"
  podman pod rm -f "$POD_NAME"
fi

# Create pod
echo "Creating pod: $POD_NAME"
podman pod create --name "$POD_NAME"

# Start container
echo "Starting container: $CONTAINER_NAME"
podman run -d \
  --name "$CONTAINER_NAME" \
  --pod "$POD_NAME" \
  --env-file "$SCRIPT_DIR/.env" \
  -v "$DATA_VOLUME:/data:Z" \
  --restart unless-stopped \
  "$IMAGE_NAME"

echo ""
echo "=== Setup Complete ==="
echo "Pod: $POD_NAME"
echo "Container: $CONTAINER_NAME"
echo "Data volume: $DATA_VOLUME"
echo ""
echo "Check status: podman pod ps"
echo "View logs: podman logs -f $CONTAINER_NAME"
echo "Or use: $SCRIPT_DIR/podman-manage.sh status|logs|stop|restart|rebuild"
