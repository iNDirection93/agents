#!/usr/bin/env bash
# wait.sh <mission-id> <window> [--timeout SECS] [--stuck SECS]
#
# Blocks until the todbot reaches a terminal condition, then prints one line and
# exits with a distinct code so Tod can branch without parsing prose:
#
#   DONE:<VERDICT>     0    sentinel TODBOT-DONE:<bot>:<VERDICT> seen in the log
#   BLOCKED:<REASON>  10    sentinel TODBOT-BLOCKED:<bot>:<REASON> seen
#   STUCK             11    log has not grown for --stuck seconds
#   TIMEOUT           12    --timeout reached with no sentinel
#   GONE              13    the window disappeared (crash, or someone closed it)
#
# STUCK is mechanical — "the log stopped growing" — not a judgement about whether
# the bot is thinking hard.

. "$(dirname "$0")/_common.sh"

MISSION=${1:?mission id required}; WINDOW=${2:?window required}; shift 2
TIMEOUT=$TODBOT_WAIT_TIMEOUT; STUCK=$TODBOT_STUCK_SECS
while [ $# -gt 0 ]; do
  case $1 in
    --timeout) TIMEOUT=${2:?}; shift 2 ;;
    --stuck)   STUCK=${2:?};   shift 2 ;;
    *) die "unknown arg: $1" ;;
  esac
done

need_tmux
LOG=$(log_path "$MISSION" "$WINDOW")
START=$(date +%s)

while :; do
  if [ -f "$LOG" ]; then
    # Last sentinel wins: a bot may print BLOCKED, get unblocked, then finish.
    LINE=$(grep -E 'TODBOT-(DONE|BLOCKED):' "$LOG" 2>/dev/null | tail -n 1 || true)
    if [ -n "$LINE" ]; then
      KIND=$(printf '%s' "$LINE" | sed -E 's/.*TODBOT-(DONE|BLOCKED):.*/\1/')
      REST=$(printf '%s' "$LINE" | sed -E 's/.*TODBOT-(DONE|BLOCKED):[A-Za-z0-9_-]+:([A-Za-z0-9_:-]+).*/\2/')
      if [ "$KIND" = DONE ]; then printf 'DONE:%s\n' "$REST"; exit 0
      else printf 'BLOCKED:%s\n' "$REST"; exit 10; fi
    fi
  fi

  if ! window_exists "$MISSION" "$WINDOW"; then printf 'GONE\n'; exit 13; fi

  NOW=$(date +%s)
  [ $((NOW - START)) -ge "$TIMEOUT" ] && { printf 'TIMEOUT\n'; exit 12; }
  [ "$(file_age_secs "$LOG")" -ge "$STUCK" ] && { printf 'STUCK\n'; exit 11; }

  sleep 5
done
