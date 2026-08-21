#!/usr/bin/env bash
# Points a sites-dev site to the current branch's tool-platform deployment.
# Usage: point-to-branch.sh [--sim] <site-id>
#        point-to-branch.sh --revert <site-id>
#
# --sim   Point to the sim deployment (includes mock server, platform-test,
#         and python test servers) instead of the main branch deployment.
set -euo pipefail

REVERT=false
SIM=false

while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --revert) REVERT=true; shift ;;
    --sim)    SIM=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

SITE_NS="${1:?Usage: point-to-branch.sh [--revert] [--sim] <site-id>}"
BRANCH=$(git branch --show-current | tr '/' '-' | tr '[:upper:]' '[:lower:]' | cut -c1-33 | sed 's/-$//')

# --- Resolve target gateway ---

if [[ "$REVERT" == "true" ]]; then
  RELEASE_NAME="tool-platform"
  echo "Reverting site ${SITE_NS} to main deployment..."
else
  if [[ "$SIM" == "true" ]]; then
    PATTERN="^deployment.apps/sim-.*${BRANCH:0:15}.*-gateway$"
    LABEL="sim"
  else
    PATTERN="^deployment.apps/tool-platform-.*${BRANCH:0:15}.*-gateway$"
    LABEL="branch"
  fi

  GATEWAY_DEPLOY=$(kubectl get deploy -n tool-platform -o name 2>/dev/null | grep "$PATTERN" | head -1)
  if [[ -z "$GATEWAY_DEPLOY" ]]; then
    echo "ERROR: No ${LABEL} gateway deployment found matching branch '${BRANCH}' in tool-platform namespace."
    echo "Has CI completed? Check the pipeline."
    exit 1
  fi

  RELEASE_NAME=$(echo "$GATEWAY_DEPLOY" | sed 's|deployment.apps/||; s|-gateway$||')
  echo "Pointing site ${SITE_NS} to ${LABEL} deployment for branch '${BRANCH}' (release: ${RELEASE_NAME})..."
fi

GATEWAY_URL="http://${RELEASE_NAME}-gateway.tool-platform.svc.cluster.local:8080"
EXTERNAL_NAME="${RELEASE_NAME}-gateway.tool-platform.svc.cluster.local"

# --- Patch configmap ---

CURRENT=$(kubectl get configmap appian-custom-properties -n "${SITE_NS}" -o json)
if echo "$CURRENT" | jq -r '.data["custom.properties"]' | grep -q "conf.lcp-mcp-server.serviceUrl="; then
  echo "$CURRENT" \
    | jq --arg url "$GATEWAY_URL" '.data["custom.properties"] |= gsub("conf.lcp-mcp-server.serviceUrl=.*"; "conf.lcp-mcp-server.serviceUrl=\($url)")' \
    | kubectl apply -f -
else
  echo "$CURRENT" \
    | jq --arg url "$GATEWAY_URL" '.data["custom.properties"] += "\nconf.lcp-mcp-server.serviceUrl=\($url)"' \
    | kubectl apply -f -
fi

# --- Patch ExternalName service ---

kubectl patch svc mcp -n "${SITE_NS}" -p "{\"spec\":{\"externalName\":\"${EXTERNAL_NAME}\"}}"

echo ""
echo "✅ Done."
echo "   Configmap change hot-deploys within ~1 minute."
echo "   Service patch takes effect in ~10 seconds."
if [[ "$SIM" == "true" ]]; then
  echo "   Mode: SIM (includes mock server, platform-test, python test servers)"
fi
