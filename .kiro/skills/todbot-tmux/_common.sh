#!/usr/bin/env bash
# Shared helpers for the todbot-tmux scripts. Sourced, not executed.

set -euo pipefail

TODBOT_SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TODBOT_KIRO_DIR="$(cd "$TODBOT_SKILL_DIR/../.." && pwd)"
TODBOT_REPO_ROOT="$(cd "$TODBOT_KIRO_DIR/.." && pwd)"

# shellcheck source=/dev/null
. "$TODBOT_KIRO_DIR/todbots.config.sh"

die() { printf 'todbot: %s\n' "$*" >&2; exit 2; }

need_tmux() {
  command -v tmux >/dev/null 2>&1 || die "tmux is not installed. brew install tmux / apt-get install tmux"
}

# mission_dir <mission-id>
mission_dir() {
  [ -n "${1:-}" ] || die "mission id required"
  printf '%s/%s/%s' "$TODBOT_REPO_ROOT" "$TODBOT_MISSION_ROOT" "$1"
}

session_name() { printf '%s%s' "$TODBOT_SESSION_PREFIX" "${1:?mission id required}"; }

log_path() { printf '%s/%s.log' "$(mission_dir "$1")" "${2:?window required}"; }

nudge_count_path() { printf '%s/.nudges-%s' "$(mission_dir "$1")" "${2:?window required}"; }

session_exists() { tmux has-session -t "=$(session_name "$1")" 2>/dev/null; }

window_exists() {
  tmux list-windows -t "=$(session_name "$1")" -F '#W' 2>/dev/null | grep -Fxq "$2"
}

# Portable "seconds since file was last modified". Returns a big number if absent.
file_age_secs() {
  local f=$1 mtime now
  [ -f "$f" ] || { printf '999999'; return; }
  if mtime=$(stat -c %Y "$f" 2>/dev/null); then :
  elif mtime=$(stat -f %m "$f" 2>/dev/null); then :
  else printf '0'; return; fi
  now=$(date +%s)
  printf '%s' "$(( now - mtime ))"
}

file_size() {
  local f=$1
  [ -f "$f" ] || { printf '0'; return; }
  wc -c < "$f" | tr -d ' '
}

attach_hint() {
  printf 'tmux attach -t %s \; select-window -t %s\n' "$(session_name "$1")" "${2:-}"
}
