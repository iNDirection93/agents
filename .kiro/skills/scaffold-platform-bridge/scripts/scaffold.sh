#!/usr/bin/env bash
set -euo pipefail

# scaffold-platform-bridge — generates everything needed to connect a FastMCP server
# to the AI Tools Platform gateway. Modifies Helm charts directly.
#
# Auto-discovers target directory, factory function + args, Helm chart, and package
# from just the service label. Prompts interactively if discovery fails.
#
# Usage:
#   ./scaffold.sh --service-label <label> [--project-root <path>] [options]
#
# Required:
#   --service-label  Gateway routing key (e.g., lcp-mcp). Must be valid k8s label.
#
# Optional (auto-discovered if not provided):
#   --project-root   Root of consuming project (default: git root of cwd)
#   --target         Path to MCP server project root
#   --package        Python package name
#   --factory        FastMCP factory function name
#   --factory-args   Arguments to pass to factory
#   --port           Platform port (default: 8081)
#   --existing-port  Existing server port (default: 8000)
#   --helm-chart     Path to Helm chart template
#   --no-shared-mcp-utils   Skip ContextVar imports
#
# Example:
#   ./scaffold.sh --service-label lcp-mcp --project-root ~/repo/composer

# ── Parse args ─────────────────────────────────────────────────────────────

TARGET=""
SERVICE_LABEL=""
PACKAGE=""
FACTORY=""
FACTORY_ARGS=""
PORT="8081"
EXISTING_PORT="8000"
SSE_MODULE=""
HAS_SHARED_MCP_UTILS="true"
HELM_CHART=""
HELM_VALUES_KEY=""
PROJECT_ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --service-label) SERVICE_LABEL="$2"; shift 2 ;;
    --package) PACKAGE="$2"; shift 2 ;;
    --factory) FACTORY="$2"; shift 2 ;;
    --factory-args) FACTORY_ARGS="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --existing-port) EXISTING_PORT="$2"; shift 2 ;;
    --sse-module) SSE_MODULE="$2"; shift 2 ;;
    --no-shared-mcp-utils) HAS_SHARED_MCP_UTILS="false"; shift ;;
    --helm-chart) HELM_CHART="$2"; shift 2 ;;
    --helm-values-key) HELM_VALUES_KEY="$2"; shift 2 ;;
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    -h|--help)
      sed -n '3,/^$/p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$SERVICE_LABEL" ]]; then
  echo "Error: --service-label is required."
  echo "Run with --help for usage."
  exit 1
fi

# Validate service label (k8s label value: lowercase alphanumeric + hyphens, max 63 chars)
if ! echo "$SERVICE_LABEL" | grep -qE '^[a-z][a-z0-9-]{0,61}[a-z0-9]$'; then
  echo "Error: '$SERVICE_LABEL' is not a valid service label."
  echo "Must be: lowercase, start with letter, only a-z 0-9 and -, max 63 chars."
  exit 1
fi

# ── Locate helper scripts ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Auto-discover project root ─────────────────────────────────────────────

if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -z "$PROJECT_ROOT" ]]; then
    echo "Error: Could not determine project root. Use --project-root."
    exit 1
  fi
fi
PROJECT_ROOT=$(cd "$PROJECT_ROOT" && pwd)

# ── Auto-discover target directory ─────────────────────────────────────────

if [[ -z "$TARGET" ]]; then
  # Try common conventions
  for CANDIDATE in \
    "$PROJECT_ROOT/service-components/${SERVICE_LABEL}-server" \
    "$PROJECT_ROOT/service-components/${SERVICE_LABEL}" \
    "$PROJECT_ROOT/${SERVICE_LABEL}-server" \
    "$PROJECT_ROOT/${SERVICE_LABEL}"; do
    if [[ -d "$CANDIDATE" && -f "$CANDIDATE/pyproject.toml" ]]; then
      TARGET="$CANDIDATE"
      break
    fi
  done

  if [[ -z "$TARGET" ]]; then
    echo ""
    echo "Could not find the server directory automatically."
    echo "Searched:"
    echo "  • service-components/${SERVICE_LABEL}-server/"
    echo "  • service-components/${SERVICE_LABEL}/"
    echo "  • ${SERVICE_LABEL}-server/"
    echo "  • ${SERVICE_LABEL}/"
    echo ""
    echo "Please provide the path to the MCP server project root"
    echo "(the directory containing pyproject.toml and src/):"
    echo ""
    read -rp "  Path: " TARGET
    if [[ -z "$TARGET" || ! -d "$TARGET" ]]; then
      echo "Error: '$TARGET' is not a valid directory."
      exit 1
    fi
  fi
fi
TARGET=$(cd "$TARGET" && pwd)

# ── Derive defaults ────────────────────────────────────────────────────────

if [[ -z "$PACKAGE" ]]; then
  PACKAGE=$(basename "$TARGET" | tr '-' '_')
fi

if [[ -z "$FACTORY" ]]; then
  SERVER_PY="$TARGET/src/$PACKAGE/server.py"
  if [[ -f "$SERVER_PY" ]]; then
    FACTORY=$(grep -o 'def create_[a-z_]*' "$SERVER_PY" | head -1 | sed 's/def //')
  fi
  if [[ -z "$FACTORY" ]]; then
    echo "Error: Could not find factory function in server.py. Use --factory to specify."
    exit 1
  fi
fi

# Auto-detect factory arguments from function signature
if [[ -z "$FACTORY_ARGS" ]]; then
  SERVER_PY="$TARGET/src/$PACKAGE/server.py"
  if [[ -f "$SERVER_PY" ]]; then
    # Extract signature: def create_foo(config: LCPConfig) -> FastMCP:
    SIG=$(grep "def ${FACTORY}" "$SERVER_PY" | head -1)
    # Check if it has typed parameters like (config: SomeClass)
    PARAM_TYPE=$(echo "$SIG" | grep -oE '\([a-z_]+: *([A-Z][a-zA-Z]+)' | grep -oE '[A-Z][a-zA-Z]+$' || true)
    if [[ -n "$PARAM_TYPE" ]]; then
      FACTORY_ARGS="${PARAM_TYPE}()"
    fi
  fi
fi

if [[ -z "$SSE_MODULE" ]]; then
  SSE_MODULE="${PACKAGE}.sse_server:app"
fi

# ── Auto-discover Helm chart ──────────────────────────────────────────────

if [[ -z "$HELM_CHART" ]]; then
  COMPONENT_LABEL="${SERVICE_LABEL}-server"
  HELM_CHART=$(find "$PROJECT_ROOT/charts" -name "*.yaml" -path "*template*" \
    -exec grep -l "app.kubernetes.io/component: ${COMPONENT_LABEL}" {} \; 2>/dev/null | head -1)
fi

# Helm values key: derive from service label (e.g., lcp-mcp → lcpMcpServer)
if [[ -z "$HELM_VALUES_KEY" ]]; then
  HELM_VALUES_KEY=$(echo "$SERVICE_LABEL" | awk -F'-' '{
    for(i=1;i<=NF;i++) {
      if(i==1) printf "%s", $i
      else printf "%s", toupper(substr($i,1,1)) substr($i,2)
    }
  }')
  HELM_VALUES_KEY="${HELM_VALUES_KEY}Server"
fi

# Check for shared_mcp_utils
if [[ "$HAS_SHARED_MCP_UTILS" == "true" ]]; then
  PYPROJECT="$TARGET/pyproject.toml"
  if [[ -f "$PYPROJECT" ]] && ! grep -q "shared-mcp-utils" "$PYPROJECT"; then
    HAS_SHARED_MCP_UTILS="false"
  fi
fi

# ── Derive names ───────────────────────────────────────────────────────────

to_pascal() {
  echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1' | tr -d ' '
}

PASCAL=$(to_pascal "$SERVICE_LABEL")
URN_CLASS="${PASCAL}ToolUrn"
PARSER_CLASS="${PASCAL}UrnParser"
SERVER_MODULE="server"

echo "═══════════════════════════════════════════════════════════"
echo "  scaffold-platform-bridge"
echo "═══════════════════════════════════════════════════════════"
echo "  Target:         $TARGET"
echo "  Service label:  $SERVICE_LABEL"
echo "  Package:        $PACKAGE"
echo "  Factory:        $FACTORY"
echo "  Factory args:   ${FACTORY_ARGS:-<none>}"
echo "  Port:           $PORT"
echo "  Existing port:  $EXISTING_PORT"
echo "  URN class:      $URN_CLASS"
echo "  Parser class:   $PARSER_CLASS"
echo "  ContextVars:    $HAS_SHARED_MCP_UTILS"
echo "  Helm chart:     ${HELM_CHART:-<not provided>}"
echo "  Values key:     $HELM_VALUES_KEY"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. Generate platform_bridge.py ─────────────────────────────────────────

SRC_DIR="$TARGET/src/$PACKAGE"
BRIDGE_FILE="$SRC_DIR/platform_bridge.py"

if [[ -f "$BRIDGE_FILE" ]]; then
  echo "⚠️  $BRIDGE_FILE already exists — skipping (delete to regenerate)"
else
  mkdir -p "$SRC_DIR"

  if [[ "$HAS_SHARED_MCP_UTILS" == "true" ]]; then
    CONTEXT_VARS_IMPORT="from shared_mcp_utils.jsonrpc import _auth_token_var, _callback_url_var"
    AUTH_TOKEN_ARG="    auth_token_var=_auth_token_var,"
    CALLBACK_URL_ARG="    callback_url_var=_callback_url_var,"
  else
    CONTEXT_VARS_IMPORT="# No shared_mcp_utils available — auth context not propagated to tools"
    AUTH_TOKEN_ARG="    # auth_token_var=your_auth_var,  # Add ContextVar for auth if available"
    CALLBACK_URL_ARG="    # callback_url_var=your_url_var,  # Add ContextVar for callback URL if available"
  fi

  if [[ -n "$FACTORY_ARGS" ]]; then
    FACTORY_IMPORT="from .${SERVER_MODULE} import ${FACTORY}  # noqa: E402"
    FACTORY_CALL="_mcp = ${FACTORY}(${FACTORY_ARGS})"
    FACTORY_CONFIG_IMPORT=""
    if [[ "$FACTORY_ARGS" =~ ^([A-Z][a-zA-Z]+)\(\)$ ]]; then
      CONFIG_CLASS="${BASH_REMATCH[1]}"
      FACTORY_CONFIG_IMPORT="from .config import ${CONFIG_CLASS}  # noqa: E402"
      FACTORY_CALL="_config = ${CONFIG_CLASS}()
_mcp = ${FACTORY}(_config)"
    fi
  else
    FACTORY_IMPORT="from .${SERVER_MODULE} import ${FACTORY}  # noqa: E402"
    FACTORY_CALL="_mcp = ${FACTORY}()"
    FACTORY_CONFIG_IMPORT=""
  fi

  cat > "$BRIDGE_FILE" << PYTHON
"""Tools Platform bridge — exposes existing FastMCP tools via the platform gateway.

Architecture:
  - Existing SSE/JSONRPC app stays on its port (${EXISTING_PORT}) — unchanged
  - Platform SDK app runs on PLATFORM_PORT (default: ${PORT}) — the gateway routes to this
  - Both share the same FastMCP instance and ContextVars

Usage:
  uvicorn ${PACKAGE}.platform_bridge:platform_app.asgi --port ${PORT}

Discovery:
  The k8s Service must carry label: tool-platform.appian.com/server-id: ${SERVICE_LABEL}
  The gateway connects on port ${PORT} and routes URNs like: urn:v1:${SERVICE_LABEL}:<tool>:mcp-bridge
"""

import os
from dataclasses import dataclass

${CONTEXT_VARS_IMPORT}
from tools_platform_sdk import BaseToolUrn, PlatformUrnParser, ToolsPlatformApp
from tools_platform_sdk.fastmcp_bridge import bridge_fastmcp_tools


# ── URN definition ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ${URN_CLASS}(BaseToolUrn):
    """URN shape: urn:v1:${SERVICE_LABEL}:<tool_name>:<handler_key>"""

    _handler_key: str

    @property
    def handler_key(self) -> str:
        return self._handler_key


class ${PARSER_CLASS}(PlatformUrnParser):
    """Parses URNs for the ${SERVICE_LABEL} tool server."""

    def __init__(self):
        super().__init__(min_segments=5)

    def parse_suffix(self, raw_urn, tool_name, suffix):
        return ${URN_CLASS}(
            **self._base_fields(raw_urn, tool_name),
            _handler_key=suffix[0] if suffix else "mcp-bridge",
        )


# ── Platform app (gateway talks to this) ──────────────────────────────────

kas_base_url = os.environ.get("KAS_BASE_URL")

platform_app = ToolsPlatformApp(
    ${PARSER_CLASS}(),
    dev_mode=os.environ.get("PLATFORM_DEV_MODE", "").lower() == "true",
    kas_base_url=kas_base_url,
${AUTH_TOKEN_ARG}
${CALLBACK_URL_ARG}
)


# ── Bridge existing tools ─────────────────────────────────────────────────

${FACTORY_IMPORT}
${FACTORY_CONFIG_IMPORT}

${FACTORY_CALL}
bridge_fastmcp_tools(platform_app, _mcp)
PYTHON

  echo "✅ Created $BRIDGE_FILE"
fi

# ── 2. Generate scripts/run-server.sh ───────────────────────────────────────

SCRIPTS_DIR="$TARGET/scripts"
DUAL_SCRIPT="$SCRIPTS_DIR/run-server.sh"

# Detect existing entrypoint module from Dockerfile
DOCKERFILE="$TARGET/Dockerfile"
EXISTING_MODULE="${PACKAGE}.sse_server"
if [[ -f "$DOCKERFILE" ]]; then
  DETECTED=$(grep "^CMD" "$DOCKERFILE" | grep -oE "${PACKAGE}\.[a-z_]+" | head -1)
  if [[ -n "$DETECTED" ]]; then
    EXISTING_MODULE="$DETECTED"
  fi
fi

# Detect graceful shutdown timeout from the existing server
GRACEFUL_TIMEOUT="300"
SSE_SERVER_PY="$TARGET/src/$PACKAGE/sse_server.py"
if [[ -f "$SSE_SERVER_PY" ]]; then
  DETECTED_TIMEOUT=$(grep -oE "timeout_graceful_shutdown=[0-9]+" "$SSE_SERVER_PY" | grep -oE "[0-9]+" | head -1 || true)
  if [[ -n "$DETECTED_TIMEOUT" ]]; then
    GRACEFUL_TIMEOUT="$DETECTED_TIMEOUT"
  fi
fi

# Detect port env var from Dockerfile or existing server
PORT_ENV_VAR="PLATFORM_SSE_PORT"
if [[ -f "$DOCKERFILE" ]]; then
  DETECTED_PORT_VAR=$(grep -oE '[A-Z_]+_PORT' "$DOCKERFILE" | head -1 || true)
  if [[ -n "$DETECTED_PORT_VAR" ]]; then
    PORT_ENV_VAR="$DETECTED_PORT_VAR"
  fi
fi

if [[ -f "$DUAL_SCRIPT" ]]; then
  echo "⚠️  $DUAL_SCRIPT already exists — skipping"
else
  mkdir -p "$SCRIPTS_DIR"
  cat > "$DUAL_SCRIPT" << BASH
#!/usr/bin/env bash
set -euo pipefail
# Server entrypoint — runs both SSE/JSONRPC and platform bridge endpoints.
# Shares the same FastMCP instance and ContextVars — no resource duplication.

exec python -c "
import asyncio
import os
import uvicorn

async def main():
    from ${EXISTING_MODULE} import create_app
    try:
        sse_app = create_app()
    except (ImportError, AttributeError):
        from ${EXISTING_MODULE} import app as sse_app

    from ${PACKAGE}.platform_bridge import platform_app

    sse_port = int(os.environ.get('${PORT_ENV_VAR}', '${EXISTING_PORT}'))
    platform_port = int(os.environ.get('PLATFORM_PORT', '${PORT}'))

    sse_config = uvicorn.Config(sse_app, host='0.0.0.0', port=sse_port, log_level='info', timeout_graceful_shutdown=${GRACEFUL_TIMEOUT})
    platform_config = uvicorn.Config(platform_app.asgi, host='0.0.0.0', port=platform_port, log_level='info', timeout_graceful_shutdown=30)

    print(f'Starting platform-enabled server:')
    print(f'  Port {sse_port} — existing SSE/JSONRPC')
    print(f'  Port {platform_port} — Platform SDK (gateway)')

    await asyncio.gather(
        uvicorn.Server(sse_config).serve(),
        uvicorn.Server(platform_config).serve(),
    )

asyncio.run(main())
"
BASH

  chmod +x "$DUAL_SCRIPT"
  echo "✅ Created $DUAL_SCRIPT"
fi

# ── 4. Modify Helm chart (if provided) ────────────────────────────────────

if [[ -n "$HELM_CHART" ]]; then
  if [[ ! -f "$HELM_CHART" ]]; then
    echo "❌ Helm chart not found: $HELM_CHART"
    exit 1
  fi

  # Check if already patched
  if grep -q "tool-platform.appian.com/server-id: ${SERVICE_LABEL}" "$HELM_CHART"; then
    echo "ℹ️  Helm chart already has discovery label for ${SERVICE_LABEL} — skipping"
  else
    echo "📝 Modifying Helm chart: $HELM_CHART"

    # ── 4a. Add discovery label to the Service ──
    # Find the Service for this server and add the label + port
    # Pattern: find the Service metadata block, add label after existing labels line

    # Build the component label we're looking for in the selector
    COMPONENT_LABEL="${SERVICE_LABEL}-server"

    HELM_CHART="$HELM_CHART" SERVICE_LABEL="$SERVICE_LABEL" PORT="$PORT" \
      python3 "$SCRIPT_DIR/patch_service.py"

    # ── 4b. Add discovery label to the Pod template ──
    # The gateway's egress CNP allows traffic to pods with this label.
    # Without it on the pod, cross-namespace traffic is blocked.
    HELM_CHART="$HELM_CHART" SERVICE_LABEL="$SERVICE_LABEL" \
      python3 "$SCRIPT_DIR/patch_pod_label.py"

    # ── 4c. Add platform port and platform-enabled command to existing container ──
    # Instead of a sidecar, run both SSE and platform bridge in one process.
    # This avoids doubling resource overhead. The container runs run-server.sh
    # which starts both servers via asyncio.gather in a single Python process.
    HELM_CHART="$HELM_CHART" SERVICE_LABEL="$SERVICE_LABEL" PORT="$PORT" EXISTING_PORT="$EXISTING_PORT" \
      python3 "$SCRIPT_DIR/patch_container.py"
  fi
else
  echo "ℹ️  No --helm-chart provided — skipping Helm modifications"
  echo "    To make the server discoverable, add to your Service:"
  echo "      label: tool-platform.appian.com/server-id: ${SERVICE_LABEL}"
  echo "      port:  ${PORT}"
fi

# ── 4c. Patch CiliumNetworkPolicy (if present) ────────────────────────────
# The gateway connects to the platform bridge on the platform port. If a CNP
# restricts ingress to only the existing port, the gateway's feature probe and
# tool calls will be blocked (context deadline exceeded).

if [[ -n "$HELM_CHART" ]]; then
  CHART_DIR=$(dirname "$HELM_CHART")
  CNP_FILE=$(find "$CHART_DIR" -name "*cilium*" -o -name "*network-policy*" 2>/dev/null | head -1)

  if [[ -n "$CNP_FILE" && -f "$CNP_FILE" ]]; then
    # Check if port already exists in the ingress section (not egress)
    # Look for the port appearing after "ingress:" but before "egress:"
    if awk '/^  ingress:/,/^  egress:/' "$CNP_FILE" | grep -q "port: \"${PORT}\""; then
      echo "ℹ️  CiliumNetworkPolicy already allows port ${PORT} in ingress"
    else
      echo "📝 Patching CiliumNetworkPolicy: $CNP_FILE"
      # Add platform port alongside existing port in the first ingress rule
      CNP_FILE="$CNP_FILE" PORT="$PORT" EXISTING_PORT="$EXISTING_PORT" \
        python3 "$SCRIPT_DIR/patch_cnp.py"
    fi
  fi
fi

# ── 5. Modify pyproject.toml ──────────────────────────────────────────────

PYPROJECT="$TARGET/pyproject.toml"

if [[ -f "$PYPROJECT" ]]; then
  if grep -q "tools-platform-sdk" "$PYPROJECT"; then
    echo "ℹ️  tools-platform-sdk already in pyproject.toml"
  else
    # Add the dependency
    PYPROJECT="$PYPROJECT" python3 "$SCRIPT_DIR/patch_pyproject.py"
  fi
else
  echo "⚠️  No pyproject.toml found at $TARGET"
fi

# ── 6. Regenerate lockfile ────────────────────────────────────────────────
# The Dockerfile uses `uv sync --frozen` which requires the lockfile to already
# include the new dependency. Find the workspace root (where uv.lock lives) and
# run `uv lock` to regenerate it.
#
# This may fail locally if the project has generated SDK dependencies that only
# exist after running generate-sdk.sh. If so, generate them first and retry.

find_workspace_root() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/uv.lock" ]]; then
      echo "$dir"
      return 0
    fi
    dir=$(dirname "$dir")
  done
  return 1
}

WORKSPACE_ROOT=$(find_workspace_root "$TARGET") || true

if [[ -n "$WORKSPACE_ROOT" && -f "$WORKSPACE_ROOT/uv.lock" ]]; then
  echo "📦 Regenerating lockfile at $WORKSPACE_ROOT/uv.lock ..."

  UV_OUTPUT=$(cd "$WORKSPACE_ROOT" && uv lock 2>&1) && {
    echo "  ✅ Lockfile updated"
  } || {
    # Check if the failure is due to missing generated SDKs (editable path deps)
    if echo "$UV_OUTPUT" | grep -q "Distribution not found at"; then
      echo "  ℹ️  Lock failed due to missing generated SDKs — looking for generate-sdk.sh..."

      # Find and run generate-sdk.sh
      GEN_SCRIPT=$(find "$TARGET" -name "generate-sdk.sh" -path "*/scripts/*" | head -1)
      if [[ -n "$GEN_SCRIPT" ]]; then
        echo "  📦 Running $GEN_SCRIPT ..."
        GEN_OUTPUT=$(bash "$GEN_SCRIPT" 2>&1)
        if [[ $? -eq 0 ]]; then
          echo "  ✅ SDKs generated"
          # Retry uv lock
          UV_OUTPUT=$(cd "$WORKSPACE_ROOT" && uv lock 2>&1) && {
            echo "  ✅ Lockfile updated"
          } || {
            echo "  ⚠️  uv lock still failed after generating SDKs"
            echo "      Error: $(echo "$UV_OUTPUT" | tail -1)"
          }
        else
          echo "  ⚠️  generate-sdk.sh failed:"
          echo "$GEN_OUTPUT" | tail -5 | sed 's/^/      /'
          echo "      Lockfile needs manual regeneration"
        fi
      else
        echo "  ⚠️  No generate-sdk.sh found — lockfile needs manual regeneration"
        echo "      Run: cd $WORKSPACE_ROOT && uv lock"
      fi
    else
      echo "  ⚠️  uv lock failed"
      echo "      Error: $(echo "$UV_OUTPUT" | tail -1)"
    fi
  }
else
  echo "ℹ️  No uv.lock found — skipping lockfile regeneration"
fi

# ── 7. Patch Dockerfile CMD ───────────────────────────────────────────────
# Change the CMD to use run-server.sh so both SSE and platform bridge run in
# one process. This avoids needing a sidecar container.

DOCKERFILE="$TARGET/Dockerfile"
if [[ -f "$DOCKERFILE" ]]; then
  if grep -q "run-server.sh\|platform_bridge" "$DOCKERFILE"; then
    echo "ℹ️  Dockerfile already references platform-enabled — skipping"
  else
    # Add COPY for scripts directory in the final stage (before CMD)
    if ! grep -q "COPY.*scripts/" "$DOCKERFILE"; then
      sed -i.bak '/^CMD /i\
COPY scripts/ ./scripts/' "$DOCKERFILE"
      rm -f "${DOCKERFILE}.bak"
    fi
    # Replace the CMD line with run-server.sh
    if grep -q "^CMD " "$DOCKERFILE"; then
      sed -i.bak 's|^CMD .*|CMD ["bash", "scripts/run-server.sh"]|' "$DOCKERFILE"
      rm -f "${DOCKERFILE}.bak"
      echo "✅ Patched Dockerfile (COPY scripts/ + CMD → scripts/run-server.sh)"
    else
      echo "  ⚠️  No CMD found in Dockerfile — add: CMD [\"bash\", \"scripts/run-server.sh\"]"
    fi
  fi
else
  echo "ℹ️  No Dockerfile found — skipping"
fi

# ── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Scaffold complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Generated:"
echo "    • src/${PACKAGE}/platform_bridge.py"
echo "    • scripts/run-server.sh"
if [[ -n "$HELM_CHART" ]]; then
echo "  Modified:"
echo "    • $HELM_CHART (discovery label + pod label + port)"
fi
echo "    • pyproject.toml (added tools-platform-sdk dep)"
echo "    • Dockerfile (COPY scripts/ + CMD)"
echo ""
echo "  ─── Next steps ───"
echo ""
echo "  1. Push branch → gateway auto-discovers within 5 min"
echo ""
echo "  2. Verify in cluster:"
echo "     kubectl get svc -A -l tool-platform.appian.com/server-id=${SERVICE_LABEL}"
echo ""
