#!/usr/bin/env bash
# spawn.sh <mission-id> <bot> [window] [--brief <path>] [--no-prompt]
#
# Opens (or reuses) the mission's tmux session, adds one window running the bot's
# CLI, pipes the pane to a redacted log, and types the opening order.
#
# Window name defaults to the bot name. Pass a window name to run a second
# instance of the same bot (G4 verification: `spawn.sh bd-a1b2 recon verify`).

. "$(dirname "$0")/_common.sh"

usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

MISSION=${1:-}; BOT=${2:-}
[ -n "$MISSION" ] && [ -n "$BOT" ] || usage
shift 2

WINDOW=$BOT
case "${1:-}" in ''|--*) ;; *) WINDOW=$1; shift ;; esac

BRIEF=""; PROMPT=1
while [ $# -gt 0 ]; do
  case $1 in
    --brief) BRIEF=${2:?--brief needs a path}; shift 2 ;;
    --no-prompt) PROMPT=0; shift ;;
    *) usage ;;
  esac
done

case "$BOT" in
  recon|recon-todbot)           AGENT=recon-todbot ;;
  sim|sim-todbot)               AGENT=sim-todbot ;;
  terminator|terminator-todbot) AGENT=terminator-todbot ;;
  *) die "unknown bot '$BOT' (recon | sim | terminator)" ;;
esac

need_tmux
MDIR=$(mission_dir "$MISSION")
[ -d "$MDIR" ] || die "mission dir $MDIR does not exist — run mission-init.sh $MISSION first"

# Default brief: mission-<window>.md, so `recon` and `verify` get different orders.
[ -n "$BRIEF" ] || BRIEF="$TODBOT_MISSION_ROOT/$MISSION/mission-$WINDOW.md"
[ -f "$TODBOT_REPO_ROOT/$BRIEF" ] || die "brief not found: $BRIEF (Tod writes the brief before spawning)"

SESSION=$(session_name "$MISSION")
LOG=$(log_path "$MISSION" "$WINDOW")

if window_exists "$MISSION" "$WINDOW"; then
  die "window '$WINDOW' already exists in $SESSION. Read it (peek.sh) or tear it down deliberately."
fi

# The trailing shell keeps the pane alive after the CLI exits, so its final
# output — and any crash — survives for inspection and a human can take over.
CMD="cd $(printf '%q' "$TODBOT_REPO_ROOT") && $TODBOT_CLI $TODBOT_CLI_ARGS $AGENT; printf '\n[todbot pane: %s exited]\n' $AGENT; exec \${SHELL:-bash}"

if session_exists "$MISSION"; then
  tmux new-window -d -t "=$SESSION" -n "$WINDOW" "bash -lc $(printf '%q' "$CMD")"
else
  # Wide geometry: a narrow detached session wraps long lines, which splits
  # tokens across lines where the redactor cannot match them.
  tmux new-session -d -x "${TODBOT_PANE_COLS:-220}" -y "${TODBOT_PANE_ROWS:-50}" \
    -s "$SESSION" -n "$WINDOW" "bash -lc $(printf '%q' "$CMD")"
fi

: > "$LOG"
tmux pipe-pane -o -t "=$SESSION:$WINDOW" "exec $(printf '%q' "$TODBOT_SKILL_DIR/redact.sh") >> $(printf '%q' "$LOG")"

if [ "$PROMPT" = 1 ]; then
  [ "$TODBOT_READY_WAIT" -gt 0 ] && sleep "$TODBOT_READY_WAIT"
  tmux send-keys -t "=$SESSION:$WINDOW" \
    "Read $BRIEF and carry it out. Follow it exactly. When you are done, write your report and print the sentinel from the brief." Enter
fi

printf 'spawned  session=%s window=%s agent=%s\n' "$SESSION" "$WINDOW" "$AGENT"
printf 'log      %s\n' "$LOG"
printf 'attach   %s\n' "$(attach_hint "$MISSION" "$WINDOW")"
