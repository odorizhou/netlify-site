#!/usr/bin/env bash
# Enable or disable Apache routes for /preview/ and /preview-data/ (port 6006 vhost).
# Does not affect /monitor or production Netlify. Requires sudo for Apache paths.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAG_SRC="${SCRIPT_DIR}/apache-preview-enable.conf"
FRAG_DST="/etc/apache2/katago-vhost.d/preview.conf"

usage() {
  echo "Usage: $0 {on|off|status}" >&2
  echo "  on     — install preview fragment and reload Apache" >&2
  echo "  off    — remove preview fragment and reload Apache" >&2
  echo "  status — print on or off" >&2
  exit 1
}

case "${1:-}" in
  on)
    if [[ ! -f "$FRAG_SRC" ]]; then
      echo "Missing $FRAG_SRC" >&2
      exit 1
    fi
    sudo mkdir -p "$(dirname "$FRAG_DST")"
    sudo cp "$FRAG_SRC" "$FRAG_DST"
    sudo chmod 644 "$FRAG_DST"
    sudo apache2ctl configtest
    sudo apache2ctl graceful
    echo "Apache preview routes enabled (fragment at $FRAG_DST)."
    ;;
  off)
    sudo rm -f "$FRAG_DST"
    sudo apache2ctl configtest
    sudo apache2ctl graceful
    echo "Apache preview routes disabled."
    ;;
  status)
    if [[ -f "$FRAG_DST" ]]; then
      echo "on"
    else
      echo "off"
    fi
    ;;
  *)
    usage
    ;;
esac
