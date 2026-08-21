#!/usr/bin/env bash
# Resolves a site URL or hostname to its site ID (k8s namespace) via ingress lookup.
# Usage: resolve-site.sh <url-or-hostname>
# Example: resolve-site.sh https://my-site.dev.appian-sites.net
#          resolve-site.sh my-site.dev.appian-sites.net
set -euo pipefail

INPUT="${1:?Usage: resolve-site.sh <url-or-hostname>}"

# Strip protocol and trailing path
HOST=$(echo "$INPUT" | sed 's|^https\?://||' | sed 's|/.*||')

SITE_NS=$(kubectl get ingress -A -o json \
  | jq -r --arg host "$HOST" '.items[] | select(.spec.rules[]?.host == $host) | .metadata.namespace' \
  | head -1)

if [[ -z "$SITE_NS" ]]; then
  echo "ERROR: No ingress found for hostname '${HOST}'" >&2
  exit 1
fi

echo "$SITE_NS"
