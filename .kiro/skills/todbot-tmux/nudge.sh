#!/usr/bin/env bash
# nudge.sh <mission-id> <window> <message...>
#
# Types a correction into a todbot's pane. A nudge names the missing thing and
# the next concrete action — "keep going" costs a turn and buys nothing.
#
# Refuses past TODBOT_NUDGE_MAX (default 2) and prints the human attach command
# instead. That refusal is the point: two unanswered nudges means a human is
# cheaper than a third try.

. "$(dirname "$0")/_common.sh"

MISSION=${1:?mission id required}; WINDOW=${2:?window required}; shift 2
[ $# -gt 0 ] || die "a nudge needs a message"
MSG="$*"

need_tmux
window_exists "$MISSION" "$WINDOW" || die "no window '$WINDOW' in $(session_name "$MISSION")"

CFILE=$(nudge_count_path "$MISSION" "$WINDOW")
COUNT=0; [ -f "$CFILE" ] && COUNT=$(cat "$CFILE")

if [ "$COUNT" -ge "$TODBOT_NUDGE_MAX" ]; then
  cat >&2 <<MSGEOF
todbot: nudge limit reached for $WINDOW ($COUNT/$TODBOT_NUDGE_MAX).

Escalate to the human. Give them this, verbatim:

  $(attach_hint "$MISSION" "$WINDOW")

...along with what the bot is stuck on and what it needs to be unblocked.
MSGEOF
  exit 20
fi

COUNT=$((COUNT + 1)); printf '%s' "$COUNT" > "$CFILE"
tmux send-keys -t "=$(session_name "$MISSION"):$WINDOW" "$MSG" Enter
printf 'nudged %s (%s/%s): %s\n' "$WINDOW" "$COUNT" "$TODBOT_NUDGE_MAX" "$MSG"

# Nudges are part of the mission record.
printf '%s  NUDGE %-10s (%s/%s) %s\n' "$(date -u +%FT%TZ)" "$WINDOW" "$COUNT" "$TODBOT_NUDGE_MAX" "$MSG" \
  >> "$(mission_dir "$MISSION")/99-mission-log.md"
