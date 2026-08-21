---
name: scaffold-platform-bridge
description: "Scaffolds the Tools Platform SDK FastMCP bridge for a consumer's existing MCP server. Use when someone wants to add platform gateway support to their FastMCP server, says 'bridge to platform', 'add platform endpoint', 'scaffold platform bridge', 'connect to gateway', or wants to run an existing server behind the AI Tools Platform gateway. Generates a platform_bridge.py module, modifies Helm charts, Dockerfile, and dependencies."
---

# scaffold-platform-bridge

Generates and modifies everything needed to connect an existing FastMCP-based MCP server to the AI Tools Platform gateway. No manual patching required.

## What This Does

1. **Generates** `platform_bridge.py` — bridge module sharing existing `@mcp.tool()` registrations
2. **Generates** `scripts/run-server.sh` — entrypoint running both SSE + platform in one process
3. **Modifies** Helm chart — discovery label, pod label, platform port, KAS_BASE_URL env
4. **Modifies** CiliumNetworkPolicy — port 8081 ingress
5. **Modifies** Dockerfile — `COPY scripts/` + CMD
6. **Modifies** `pyproject.toml` + regenerates `uv.lock`

After running, push the branch. Gateway discovers within 5 minutes.

## Inputs

Ask the user for the **service label** only. Validate it's a valid k8s label (lowercase, a-z 0-9 hyphens, max 63 chars).

| Input | Required | Auto-discovered from |
|-------|----------|---------------------|
| `--service-label` | ✅ Ask user | — |
| `--project-root` | ❌ | `git rev-parse --show-toplevel` |
| `--target` | ❌ | `service-components/<label>-server/` (prompts if not found) |
| Everything else | ❌ | Inspects server.py, Dockerfile, Helm chart |

The script auto-discovers:
- **Target directory** — searches `service-components/<label>-server/`, prompts if not found
- **Factory function** — scans `server.py` for `def create_*`
- **Factory arguments** — inspects function signature for typed params (e.g., `(config: LCPConfig)` → `LCPConfig()`)
- **Graceful shutdown timeout** — reads from existing `sse_server.py`
- **Port env var** — checks Dockerfile and Helm chart for `*_PORT` variables
- **Helm chart** — finds chart templates containing the server's component label
- **CiliumNetworkPolicy** — finds CNP in the same chart directory
- **Lockfile** — walks up for `uv.lock`, runs `uv lock` (with SDK generation retry)

## Usage

```bash
# From within the consuming project's repo:
.kiro/skills/scaffold-platform-bridge/scripts/scaffold.sh --service-label lcp-mcp

# Or with explicit project root:
.kiro/skills/scaffold-platform-bridge/scripts/scaffold.sh \
  --service-label lcp-mcp \
  --project-root ~/repo/composer
```

## After Running

1. Push branch → ArgoCD deploys → gateway discovers within 5 min
2. Verify: `kubectl get svc -A -l tool-platform.appian.com/server-id=<label>`

## Post-Scaffold Review (REQUIRED)

After the script runs, the agent MUST review every modified file. Check:

1. **`platform_bridge.py`** — verify factory import and call match the actual function signature.

2. **`scripts/run-server.sh`** — verify behavioral equivalence with original CMD:
   - `timeout_graceful_shutdown` matches the original
   - Port env var matches what the Helm chart injects
   - `exec` prefix is present (Python must be PID 1)

3. **Helm chart** — verify:
   - Discovery label on correct Service only
   - Pod template label at 8-space indent under `template.metadata.labels`
   - Platform port added (no duplicate `protocol: TCP`)
   - **`KAS_BASE_URL` env var is present** (without it, bridge crashes at startup — dev mode requires explicit `PLATFORM_DEV_MODE=true`)
   - No other Deployments/Services modified

4. **Dockerfile** — verify:
   - `COPY scripts/` in final stage with **correct path relative to build context**
   - CMD references correct script path

5. **`pyproject.toml`** — dependency in `[project]` section, index not duplicated.

Common problems to fix:
- Factory requires arguments the script didn't detect (fix the import/call in platform_bridge.py)
- Port env var wrong (script checked Dockerfile but the real env var is in Helm)
- `COPY scripts/` path wrong due to build context mismatch (monorepo builds often use repo root as context)
- `KAS_BASE_URL` missing (script couldn't detect it — add manually to container env)
- Duplicate `protocol: TCP` in Helm port block (script bug with some YAML structures)

## Idempotent

Running twice is safe — skips already-present changes.

## Reference

See `context/architecture.md` for discovery mechanics, naming conventions, and URN format.
