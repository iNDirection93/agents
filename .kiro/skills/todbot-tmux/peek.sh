#!/usr/bin/env bash
# peek.sh <mission-id> <window> [lines]
#
# Prints the tail of a todbot's live pane. Read-only: never sends keys.
# Default 80 lines. Use this before every nudge — nudging blind wastes a turn.

. "$(dirname "$0")/_common.sh"

MISSION=${1:?mission id required}; WINDOW=${2:?window required}; LINES=${3:-80}
need_tmux
window_exists "$MISSION" "$WINDOW" || die "no window '$WINDOW' in $(session_name "$MISSION")"

printf '=== pane %s:%s (last %s lines) ===\n' "$(session_name "$MISSION")" "$WINDOW" "$LINES"
tmux capture-pane -p -t "=$(session_name "$MISSION"):$WINDOW" -S "-$LINES"

LOG=$(log_path "$MISSION" "$WINDOW")
printf '\n=== log %s (%s bytes, idle %ss) ===\n' "$LOG" "$(file_size "$LOG")" "$(file_age_secs "$LOG")"
