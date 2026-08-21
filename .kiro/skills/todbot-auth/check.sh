#!/usr/bin/env bash
# check.sh <mission-id> <url>
#
# Proves the stored credential authenticates, without ever printing it.
# Prints the status code and a trimmed body. Exit 0 only on a 2xx.

set -euo pipefail
KIRO="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$KIRO/todbots.config.sh"
ROOT="$(cd "$KIRO/.." && pwd)"

MISSION=${1:?mission id required}; URL=${2:?url required}
ENVFILE="$ROOT/$TODBOT_MISSION_ROOT/$MISSION/.env.auth"
[ -f "$ENVFILE" ] || { echo "todbot-auth: no credential stored for $MISSION" >&2; exit 2; }

set +x                       # never trace a command line carrying the header
# shellcheck source=/dev/null
. "$ENVFILE"

BODY=$(mktemp); trap 'rm -f "$BODY"' EXIT
CODE=$(curl -sS -o "$BODY" -w '%{http_code}' \
  -H "$TODBOT_AUTH_HEADER" -H 'Content-Type: application/json' \
  -X POST "$URL" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' || echo 000)

printf 'status %s\n' "$CODE"
head -c 400 "$BODY"; printf '\n'

case "$CODE" in
  2*) exit 0 ;;
  401|403) echo "todbot-auth: rejected. Wrong mode, expired token, or the site's auth toggles are off." >&2; exit 10 ;;
  000) echo "todbot-auth: no response. Wrong URL, or the deployment is not reachable." >&2; exit 11 ;;
  *)  exit 12 ;;
esac
