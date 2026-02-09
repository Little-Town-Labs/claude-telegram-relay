#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POD_NAME="secondbrain-relay"
CONTAINER_NAME="relay"

case "${1:-help}" in
  status)
    echo "=== Pod Status ==="
    podman pod ps --filter "name=$POD_NAME"
    echo ""
    echo "=== Container Status ==="
    podman ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Created}}"
    ;;
  logs)
    podman logs -f "$CONTAINER_NAME"
    ;;
  stop)
    echo "Stopping pod: $POD_NAME"
    podman pod stop "$POD_NAME"
    echo "Pod stopped."
    ;;
  start)
    echo "Starting pod: $POD_NAME"
    podman pod start "$POD_NAME"
    echo "Pod started."
    ;;
  restart)
    echo "Restarting pod: $POD_NAME"
    podman pod restart "$POD_NAME"
    echo "Pod restarted."
    ;;
  rebuild)
    echo "Rebuilding and restarting..."
    "$SCRIPT_DIR/podman-setup.sh"
    ;;
  *)
    echo "Usage: $0 {status|logs|stop|start|restart|rebuild}"
    echo ""
    echo "Commands:"
    echo "  status   - Show pod and container status"
    echo "  logs     - Follow container logs"
    echo "  stop     - Stop the pod"
    echo "  start    - Start the pod"
    echo "  restart  - Restart the pod"
    echo "  rebuild  - Rebuild image and restart"
    ;;
esac
