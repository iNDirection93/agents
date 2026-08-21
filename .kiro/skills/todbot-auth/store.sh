#!/usr/bin/env bash
# store.sh <mission-id> <mode>
#
# Reads a credential from STDIN (never from argv — argv is visible in `ps` and
# lands in shell history) and writes it to the mission's .env.auth with mode 0600.
#
#   mode: site-jwt | api-key
#
#   printf '%s' "$TOKEN" | .kiro/skills/todbot-auth/store.sh bd-a1b2 site-jwt
#
# Prints a fingerprint — never the credential.

set -euo pipefail
KIRO="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$KIRO/todbots.config.sh"
ROOT="$(cd "$KIRO/.." && pwd)"

MISSION=${1:?mission id required}; MODE=${2:?mode required: site-jwt | api-key}
MDIR="$ROOT/$TODBOT_MISSION_ROOT/$MISSION"
[ -d "$MDIR" ] || { echo "todbot-auth: no mission dir $MDIR" >&2; exit 2; }

case "$MODE" in
  site-jwt) HEADER_NAME="Authorization"; PREFIX="Bearer " ;;
  api-key)  HEADER_NAME="Authorization"; PREFIX="Bearer " ;;   # API keys go in Bearer too; the
                                                               # gateway detects non-RS256 and
                                                               # exchanges them for a site JWT
  *) echo "todbot-auth: unknown mode '$MODE'" >&2; exit 2 ;;
esac

SECRET=$(cat); SECRET=${SECRET%$'\n'}
[ -n "$SECRET" ] || { echo "todbot-auth: empty credential on stdin" >&2; exit 2; }

ENVFILE="$MDIR/.env.auth"
umask 077
cat > "$ENVFILE" <<INNER
# Written by todbot-auth/store.sh — mode=$MODE — $(date -u +%FT%TZ)
# NEVER echo, cat, or paste these values. Reference the variables only.
TODBOT_AUTH_MODE='$MODE'
TODBOT_AUTH_HEADER='$HEADER_NAME: $PREFIX$SECRET'
export TODBOT_AUTH_MODE TODBOT_AUTH_HEADER
INNER
chmod 600 "$ENVFILE"

FP=$(printf '%s' "$SECRET" | cksum | cut -d' ' -f1)
LEN=${#SECRET}
printf 'stored   %s (mode=%s)\n' "$ENVFILE" "$MODE"
printf 'fingerprint cksum=%s length=%s   <- quote this, never the credential\n' "$FP" "$LEN"
printf 'usage    source %s && curl -H "$TODBOT_AUTH_HEADER" ...\n' "$ENVFILE"
