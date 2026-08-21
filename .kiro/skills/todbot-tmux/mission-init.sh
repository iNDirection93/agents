#!/usr/bin/env bash
# mission-init.sh <bd-id>
#
# Creates the mission directory and its skeleton. Idempotent — safe to re-run;
# never overwrites a file that already has content.

. "$(dirname "$0")/_common.sh"

MISSION=${1:?bead id required, e.g. bd-a1b2}
MDIR=$(mission_dir "$MISSION")
mkdir -p "$MDIR"

seed() { # seed <file> <heredoc-content>
  [ -s "$MDIR/$1" ] && { printf 'kept    %s\n' "$1"; return; }
  cat > "$MDIR/$1"; printf 'created %s\n' "$1"
}

seed 00-bug-report.md <<'MD'
# Bug Report — <bd-id>

## Symptom
<What the reporter saw. Their words first, your paraphrase second.>

## Observed where
<Site / environment / version. Deployed or local?>

## Expected
## Actual
## First seen
## Blast radius
<Who is affected, how often, is there a workaround.>

## Source
<Bead id, user report, alert, or the Flanders session that escalated it.>
MD

seed preconditions.md <<'MD'
# Preconditions — <bd-id>

Verified at: <UTC timestamp>

| Check | Result | How verified |
|---|---|---|
| Branch deployment exists | | `kubectl get deploy -n tool-platform -l app.kubernetes.io/instance=tool-platform-<branch>` |
| Site pointed at the branch | | point-site-to-branch skill, site `<id>` |
| Site version relevant to the bug | | **user stated verbatim:** "<...>" |
| Auth mode | | site-jwt / api-key / none |
| Ticket | | AIPL-#### |
| Observability channels live | | probe.sh: logs=? traces=? metrics=? |

## Notes
<Anything that constrains what the bots may assume.>
MD

seed 99-mission-log.md <<'MD'
# Mission Log

One line per gate decision, nudge, and approval. Append-only.

MD

touch "$MDIR/.gitkeep"
printf '\nmission dir: %s\n' "$MDIR"
printf 'next: write mission-recon.md, then spawn.sh %s recon\n' "$MISSION"
