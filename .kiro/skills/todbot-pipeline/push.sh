#!/usr/bin/env bash
# push.sh [--branch NAME] [--head-to BRANCH] [--dry-run]
#
# The only way a todbot pushes. Enforces the policy in .kiro/todbots.config.sh
# so the rule lives in one place instead of in three prompts.
#
# Exit codes:  0 pushed   3 policy: approval required   4 policy: pushing disabled
#              2 error (dirty index, wrong branch, no remote)

set -euo pipefail
KIRO="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$KIRO/todbots.config.sh"

die() { printf 'todbot-pipeline: %s\n' "$*" >&2; exit 2; }

TARGET=${TODBOT_PUSH_BRANCH:-}; DRY=0; HEAD_TO=""
while [ $# -gt 0 ]; do
  case $1 in
    --branch)  TARGET=${2:?}; shift 2 ;;
    --head-to) HEAD_TO=${2:?}; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) die "unknown arg: $1" ;;
  esac
done

CURRENT=$(git branch --show-current) || die "not a git repo"
[ -n "$TARGET" ] || TARGET=$CURRENT

# --head-to publishes the current HEAD onto another branch (the "run it on dev"
# case). Always requires approval, and is never implicit.
if [ -n "$HEAD_TO" ]; then
  TARGET=$HEAD_TO
  if [ "${TODBOT_PUSH_APPROVED:-0}" != 1 ]; then
    cat >&2 <<MSG
PUSH-APPROVAL-REQUIRED: --head-to $HEAD_TO publishes $CURRENT's HEAD onto '$HEAD_TO'.

That is never implicit. Return TODBOT-DONE:sim:NEEDS-PIPELINE and let Tod ask the
user. Once approved, and recorded in 99-mission-log.md:
  TODBOT_PUSH_APPROVED=1 $0 --head-to $HEAD_TO
MSG
    exit 3
  fi
else
  [ "$TARGET" = "$CURRENT" ] ||
    die "refusing to push '$CURRENT' to a different branch '$TARGET'.
Check out the branch you mean to push, or use --head-to $TARGET to publish this
HEAD there deliberately. A todbot never pushes a branch it is not on by accident."
fi

git diff --cached --quiet ||
  die "staged-but-uncommitted changes. Commit them first — a push is not a save."

if [ "$TODBOT_PUSH_MODE" = off ]; then
  printf 'PUSH-BLOCKED: TODBOT_PUSH_MODE=off. Return NEEDS-PIPELINE to Tod.\n' >&2
  exit 4
fi

for b in $TODBOT_PROTECTED_BRANCHES; do
  if [ "$TARGET" = "$b" ]; then
    cat >&2 <<MSG
PUSH-APPROVAL-REQUIRED: '$TARGET' is protected.

Protected branches always need explicit human approval, once per mission,
recorded in 99-mission-log.md — whatever TODBOT_PUSH_MODE says.

Return TODBOT-DONE:sim:NEEDS-PIPELINE and let Tod ask.
If approval was already granted, re-run with:
  TODBOT_PUSH_APPROVED=1 $0 --branch $TARGET
MSG
    [ "${TODBOT_PUSH_APPROVED:-0}" = 1 ] || exit 3
    printf 'approval flag present — proceeding on protected branch %s\n' "$TARGET" >&2
  fi
done

if [ "$TODBOT_PUSH_MODE" = ask ] && [ "${TODBOT_PUSH_APPROVED:-0}" != 1 ]; then
  printf 'PUSH-APPROVAL-REQUIRED: TODBOT_PUSH_MODE=ask. Return NEEDS-PIPELINE to Tod.\n' >&2
  exit 3
fi

REFSPEC=$TARGET
[ -n "$HEAD_TO" ] && REFSPEC="HEAD:$HEAD_TO"

if [ "$DRY" = 1 ]; then
  printf 'dry-run: would push %s -> origin %s (%s)\n' "$CURRENT" "$REFSPEC" "$(git rev-parse --short HEAD)"
  exit 0
fi

printf 'pushing %s -> origin %s (%s)\n' "$CURRENT" "$REFSPEC" "$(git rev-parse --short HEAD)"
if [ -n "$HEAD_TO" ]; then git push origin "$REFSPEC"; else git push -u origin "$TARGET"; fi
