#!/usr/bin/env bash
# Shared helpers for the observability scripts. Sourced, not executed.
set -euo pipefail

OBS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIRO="$(cd "$OBS_DIR/../.." && pwd)"
# shellcheck source=/dev/null
. "$KIRO/todbots.config.sh"

die() { printf 'todbot-obs: %s\n' "$*" >&2; exit 2; }

branch_slug() {
  git branch --show-current | tr '/' '-' | cut -c1-33 | sed 's/-$//'
}

# The deployment's release label, e.g. tool-platform-feature-AIPL-1234
release_name() { printf 'tool-platform-%s' "${TODBOT_BRANCH_SLUG:-$(branch_slug)}"; }

selector() { printf 'app.kubernetes.io/instance=%s' "$(release_name)"; }

need_kubectl() {
  command -v kubectl >/dev/null 2>&1 || die "kubectl not found"
  kubectl version --request-timeout=5s >/dev/null 2>&1 ||
    die "kubectl cannot reach the cluster. Credentials expired?
Run this in your own terminal (it needs interactive browser SSO):
  sso-credentials sites-dev EKSClusterAdmin
then start a new session."
}

# first_pod [extra-selector]
first_pod() {
  kubectl get pods -n "$TODBOT_K8S_NAMESPACE" -l "$(selector)${1:+,$1}" \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null
}
