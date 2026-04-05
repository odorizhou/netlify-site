#!/usr/bin/env bash
# Start/stop the local static server for /preview/ (python http.server on 4173).
# Repo root is the working directory so /preview/index.html and assets resolve.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PIDFILE="${TMPDIR:-/tmp}/netlify-site-preview-http.pid"
LOGFILE="${TMPDIR:-/tmp}/netlify-site-preview-http.log"
PORT="${PREVIEW_HTTP_PORT:-4173}"

usage() {
  echo "Usage: $0 {start|stop|status}" >&2
  echo "  start — background python3 -m http.server $PORT from repo root" >&2
  echo "  stop  — kill the server process" >&2
  echo "  status — running or stopped" >&2
  exit 1
}

is_running() {
  [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

case "${1:-}" in
  start)
    if is_running; then
      echo "Preview HTTP server already running (PID $(cat "$PIDFILE"))."
      exit 0
    fi
    cd "$REPO_ROOT"
    nohup python3 -m http.server "$PORT" >>"$LOGFILE" 2>&1 &
    echo $! >"$PIDFILE"
    echo "Preview HTTP server started on 127.0.0.1:$PORT (PID $(cat "$PIDFILE"), log $LOGFILE)."
    ;;
  stop)
    if [[ -f "$PIDFILE" ]]; then
      pid="$(cat "$PIDFILE")"
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" || true
        echo "Stopped preview HTTP server (PID $pid)."
      else
        echo "Stale PID file; removed."
      fi
      rm -f "$PIDFILE"
    else
      echo "Preview HTTP server not running (no pidfile)."
    fi
    ;;
  status)
    if is_running; then
      echo "running pid=$(cat "$PIDFILE") port=$PORT"
    else
      echo "stopped"
    fi
    ;;
  *)
    usage
    ;;
esac
