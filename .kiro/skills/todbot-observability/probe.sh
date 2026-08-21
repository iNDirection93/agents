#!/usr/bin/env bash
# probe.sh — which observability channels are actually live for this branch?
#
# Run at G0. Tod records the result in preconditions.md; recon degrades to
# logs-only when a channel is dark, but never skips observability entirely.

. "$(dirname "$0")/_obs_common.sh"

printf 'branch    %s\n' "$(branch_slug)"
printf 'release   %s\n' "$(release_name)"
printf 'namespace %s\n\n' "$TODBOT_K8S_NAMESPACE"

ok()   { printf '  live   %-10s %s\n' "$1" "$2"; }
dark() { printf '  dark   %-10s %s\n' "$1" "$2"; }

if command -v kubectl >/dev/null 2>&1 && kubectl version --request-timeout=5s >/dev/null 2>&1; then
  PODS=$(kubectl get pods -n "$TODBOT_K8S_NAMESPACE" -l "$(selector)" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  if [ "${PODS:-0}" -gt 0 ]; then
    ok   logs "$PODS pod(s) matching $(selector)"
    ok   exec "kubectl exec into the same pods"
  else
    dark logs "no pods match $(selector) — has CI deployed this branch?"
  fi
else
  dark logs "kubectl unavailable or cluster unreachable"
fi

if [ -n "$TODBOT_TRACE_SINK_URL" ]; then
  if curl -sS -m 5 -o /dev/null "$TODBOT_TRACE_SINK_URL" 2>/dev/null; then
    ok   traces "$TODBOT_TRACE_SINK_URL"
  else
    dark traces "$TODBOT_TRACE_SINK_URL set but not reachable"
  fi
elif [ -n "${TODBOT_TRACE_SINK_POD:-}" ]; then
  ok   traces "file sink in pod $TODBOT_TRACE_SINK_POD (kubectl exec)"
else
  dark traces "no sink configured — see otel-trace-sink.md"
fi

if [ -n "$TODBOT_METRICS_URL" ]; then
  ok   metrics "$TODBOT_METRICS_URL (query API)"
else
  dark metrics "no query API — metrics.sh will scrape the pod's own endpoint"
fi

printf '\nRecord this table in preconditions.md.\n'
