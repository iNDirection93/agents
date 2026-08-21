#!/usr/bin/env bash
# logs.sh [--since 10m] [--grep PATTERN] [--container NAME] [--previous] [--tail N] [--follow]
#
# Logs from the branch deployment's pods. The default lens for "what happened".

. "$(dirname "$0")/_obs_common.sh"

SINCE=10m; PATTERN=""; CONTAINER=""; PREV=""; TAIL=500; FOLLOW=""
while [ $# -gt 0 ]; do
  case $1 in
    --since)     SINCE=${2:?}; shift 2 ;;
    --grep)      PATTERN=${2:?}; shift 2 ;;
    --container) CONTAINER="-c ${2:?}"; shift 2 ;;
    --previous)  PREV="--previous"; shift ;;
    --tail)      TAIL=${2:?}; shift 2 ;;
    --follow)    FOLLOW="--follow"; shift ;;
    *) die "unknown arg: $1" ;;
  esac
done

need_kubectl
# shellcheck disable=SC2086
if [ -n "$PATTERN" ]; then
  kubectl logs -n "$TODBOT_K8S_NAMESPACE" -l "$(selector)" --all-containers=true --prefix=true \
    --since="$SINCE" --tail="$TAIL" $CONTAINER $PREV $FOLLOW 2>&1 | grep -E "$PATTERN"
else
  kubectl logs -n "$TODBOT_K8S_NAMESPACE" -l "$(selector)" --all-containers=true --prefix=true \
    --since="$SINCE" --tail="$TAIL" $CONTAINER $PREV $FOLLOW
fi
