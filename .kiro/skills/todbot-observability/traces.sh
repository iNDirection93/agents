#!/usr/bin/env bash
# traces.sh --trace-id <id> | --search <substring> [--since 15m] [--limit 20]
#
# Two backends, chosen by config (see otel-trace-sink.md):
#
#   file sink  TODBOT_TRACE_SINK_POD  — an OTel Collector writing OTLP/JSON to a
#              file; we kubectl exec and grep it. Cheapest thing that works.
#   http       TODBOT_TRACE_SINK_URL  — Tempo/Jaeger-compatible query API.
#
# With neither configured, recon degrades to logs and says so in the report.

. "$(dirname "$0")/_obs_common.sh"

TRACE_ID=""; SEARCH=""; SINCE=15m; LIMIT=20
while [ $# -gt 0 ]; do
  case $1 in
    --trace-id) TRACE_ID=${2:?}; shift 2 ;;
    --search)   SEARCH=${2:?}; shift 2 ;;
    --since)    SINCE=${2:?}; shift 2 ;;
    --limit)    LIMIT=${2:?}; shift 2 ;;
    *) die "unknown arg: $1" ;;
  esac
done
[ -n "$TRACE_ID$SEARCH" ] || die "need --trace-id or --search"

if [ -n "$TODBOT_TRACE_SINK_URL" ]; then
  if [ -n "$TRACE_ID" ]; then
    curl -sS -m 20 "${TODBOT_TRACE_SINK_URL%/}/api/traces/$TRACE_ID" | jq .
  else
    curl -sS -m 20 -G "${TODBOT_TRACE_SINK_URL%/}/api/search" \
      --data-urlencode "q=$SEARCH" --data-urlencode "limit=$LIMIT" | jq .
  fi
  exit
fi

if [ -n "${TODBOT_TRACE_SINK_POD:-}" ]; then
  need_kubectl
  FILE=${TODBOT_TRACE_SINK_FILE:-/data/traces.jsonl}
  NEEDLE=${TRACE_ID:-$SEARCH}
  kubectl exec -n "$TODBOT_K8S_NAMESPACE" "$TODBOT_TRACE_SINK_POD" -- \
    sh -c "grep -F -- '$NEEDLE' '$FILE' | tail -n $LIMIT" \
    | jq -c 'if .resourceSpans then [.resourceSpans[].scopeSpans[].spans[] | {name, traceId, spanId, parentSpanId, status: .status.code, attrs: .attributes}] else . end' \
    || die "no spans matching '$NEEDLE' in $FILE on $TODBOT_TRACE_SINK_POD"
  exit
fi

cat >&2 <<'MSG'
todbot-obs: no trace backend configured.

Set one of these in .kiro/todbots.config.local.sh:
  TODBOT_TRACE_SINK_POD=<collector pod>   # file sink — see otel-trace-sink.md
  TODBOT_TRACE_SINK_URL=<tempo/jaeger>    # existing query API

Until then: work from logs, and say so under "What I did not check".
MSG
exit 3
