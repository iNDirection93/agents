#!/usr/bin/env bash
# metrics.sh [--grep PATTERN] [--path /metrics] [--port 8080] [--query PROMQL]
#
# Resource-class evidence only — memory leaks, CPU saturation, connection-pool
# exhaustion. Most bugs are not these; reach for logs and traces first.
#
# Default path scrapes the pod's own metrics endpoint directly (the same one
# Grafana scrapes), which needs nothing beyond kubectl. --query goes to a
# Prometheus-compatible API when TODBOT_METRICS_URL is configured.

. "$(dirname "$0")/_obs_common.sh"

PATTERN=""; MPATH=/metrics; PORT=8080; PROMQL=""
while [ $# -gt 0 ]; do
  case $1 in
    --grep)  PATTERN=${2:?}; shift 2 ;;
    --path)  MPATH=${2:?}; shift 2 ;;
    --port)  PORT=${2:?}; shift 2 ;;
    --query) PROMQL=${2:?}; shift 2 ;;
    *) die "unknown arg: $1" ;;
  esac
done

if [ -n "$PROMQL" ]; then
  [ -n "$TODBOT_METRICS_URL" ] || die "TODBOT_METRICS_URL is not set — use the scrape path instead (no --query)"
  AUTH=""
  [ -n "$TODBOT_METRICS_TOKEN_FILE" ] && [ -f "$TODBOT_METRICS_TOKEN_FILE" ] &&
    AUTH="Authorization: Bearer $(cat "$TODBOT_METRICS_TOKEN_FILE")"
  set +x
  curl -sS -G "${TODBOT_METRICS_URL%/}/api/v1/query" \
    ${AUTH:+-H "$AUTH"} --data-urlencode "query=$PROMQL" | jq .
  exit
fi

need_kubectl
POD=$(first_pod); [ -n "$POD" ] || die "no pod found for $(selector)"
OUT=$(kubectl exec -n "$TODBOT_K8S_NAMESPACE" "$POD" -- \
        sh -c "curl -sS localhost:$PORT$MPATH || wget -qO- localhost:$PORT$MPATH") ||
  die "could not scrape $MPATH on $POD:$PORT — is the port right? (try --port 8081)"

if [ -n "$PATTERN" ]; then printf '%s\n' "$OUT" | grep -E "$PATTERN"; else printf '%s\n' "$OUT"; fi
