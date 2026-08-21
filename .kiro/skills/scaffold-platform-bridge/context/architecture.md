# Platform Bridge — Architecture & Discovery Reference

## Architecture

Single container, single Python process, two ports:

```
Container (one process):
  Port 8000 — existing SSE/JSONRPC endpoint (unchanged behavior)
  Port 8081 — Platform SDK endpoint (gateway connects here)
  
  Both run via asyncio.gather in run-server.sh.
  Both share the same imported modules and ContextVars.
```

No sidecar, no resource duplication.

## How Discovery Works

The gateway finds tool servers by polling k8s Services **cluster-wide** for a specific label:

```
Gateway polls: /api/v1/services?labelSelector=tool-platform.appian.com/server-id
    ↓
Finds Service with label: tool-platform.appian.com/server-id: lcp-mcp
    ↓
Constructs URL: http://<svc-name>.<namespace>.svc.cluster.local:8081
    ↓
Routes tools/list and tools/call to that URL
```

Key facts:
- Discovery is **cluster-wide** — cross-namespace works (e.g., `composer` → `tool-platform`)
- Port is **hardcoded to 8081** in the gateway
- Pod must also carry the `tool-platform.appian.com/server-id` label (gateway egress CNP)
- Polling interval: 5 minutes

## Naming Conventions

| Service label | URN class | Parser class | Values key |
|---------------|-----------|--------------|------------|
| `lcp-mcp` | `LcpMcpToolUrn` | `LcpMcpUrnParser` | `lcpMcpServer` |
| `sail-mcp` | `SailMcpToolUrn` | `SailMcpUrnParser` | `sailMcpServer` |
| `pm-mcp` | `PmMcpToolUrn` | `PmMcpUrnParser` | `pmMcpServer` |

PascalCase conversion: split on `-`, capitalize each part, join. Values key: camelCase + `Server`.

## URN Format

```
urn:v1:<service-label>:<tool-name>:mcp-bridge
```

Example: `urn:v1:lcp-mcp:listApplications:mcp-bridge`

The tool name is the `@mcp.tool()` function name.

## Further Reference

- Gateway discovery code: `gateway/mcpServer/serviceDiscovery.go`
- Cross-namespace requirements: `docs/contributor-guide.md` § Deploying a Tool Server Outside the tool-platform Namespace
- Python SDK README: `atp-sdk/tool-server/server/python-fastapi/README.md`
- FastMCP bridge source: `atp-sdk/tool-server/server/python-fastapi/src/tools_platform_sdk/fastmcp_bridge.py`
