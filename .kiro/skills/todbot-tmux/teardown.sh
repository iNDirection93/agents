#!/usr/bin/env bash
# teardown.sh <mission-id> [--force]
#
# Kills the mission's tmux session. Refuses while an expected artifact is
# missing, because a pane is the only place some of that work still exists.

. "$(dirname "$0")/_common.sh"

MISSION=${1:?mission id required}; FORCE=${2:-}
need_tmux
MDIR=$(mission_dir "$MISSION")

MISSING=""
for f in 10-repro-guide.md 99-mission-log.md; do
  [ -s "$MDIR/$f" ] || MISSING="$MISSING $f"
done

if [ -n "$MISSING" ] && [ "$FORCE" != "--force" ]; then
  die "refusing to tear down — missing artifacts:$MISSING
Read them out of the panes first (peek.sh), or pass --force if this mission
ended at NO-REPRO and you know what you are discarding."
fi

session_exists "$MISSION" && tmux kill-session -t "=$(session_name "$MISSION")"
printf 'torn down %s (artifacts kept in %s)\n' "$(session_name "$MISSION")" "$MDIR"
