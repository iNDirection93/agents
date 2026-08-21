---
name: scaffold-integration-test
description: Scaffolds integration test config for a tool server. Use when the user wants to add integration tests to a tool server, says "add integration tests", "scaffold integration test", "create test config", or wants to set up CI testing for their server. Generates test-config.json and run.sh wrapper.
---

# scaffold-integration-test

This skill generates the integration test configuration for a tool server module. The output plugs into the shared test runner at `test/integration/run.sh`.

## Inputs

Ask the user for:

1. **Module name** — the Maven module directory (e.g., `my-team-tools`). Must already exist.
2. **Service label** — the k8s routing key (e.g., `my-team`). Used in URN prefix.
3. **Site ID** — unique numeric ID for KAS key isolation (e.g., `300`). Must not conflict with existing: `200` = customer-mcp, `100` = platform-test.
4. **Tools to test** — list of tool names the server exposes. For each tool:
   - Name (e.g., `hello_world`)
   - A sample `arguments` object for `tools/call` (e.g., `{"name": "test"}`)
   - Expected substring in the response (e.g., `"Hello, test"`)
5. **Needs LCP mock?** — if yes, ask what path/method/response to mock.

If the user provides just a module name and service label, derive:
- Site ID: suggest next unused hundred (300, 400, etc.)
- Tools: ask (no good default)

## Files to Generate

### 1. `<module>/test/integration/test-config.json`

```json
{
  "name": "{{module}}",
  "site_id": "{{site_id}}",
  "urns": [
    "urn:v1:{{service_label}}:{{tool_name}}:v1"
  ],
  "assertions": {
    "tools_list": [
      {"tool": "{{tool_name}}"}
    ],
    "tools_call": [
      {"tool": "{{tool_name}}", "arguments": {{arguments}}, "response_contains": "{{expected}}"}
    ]
  }
}
```

**Required fields:** `name`, `site_id`, `urns`, `assertions`

**Optional fields (include only if needed):**
- `agent_uuid` — defaults to `"11111111-1111-1111-1111-111111111111"`. Override if testing a specific agent.
- `lcp_base_url_path` — defaults to `"/lcp/api/v1"`. Only relevant if tools call LCP.
- `extra_claims` — additional JWT claims beyond the standard set.
- `mock_expectations` — array of LCP mock setup. Only needed if tools call the LCP API. Each entry: `{"id": "...", "method": "GET|POST", "path": "/api/v1/...", "response": {"status": 200, "body": {...}}}`
- `assertions.api_key` — API key auth test section. Only needed if the server is reachable via API key (like customer-mcp). Most internal servers skip this.

**For servers with dynamic/LCP-driven tools** (e.g., design-object-tools where tools are generated from agent definitions): your tools won't appear in `tools/list` unless the mock LCP returns the data your server needs to build them. Add `mock_expectations` for every LCP endpoint your server calls during tool discovery and execution. The mock-server supports glob paths (`*` = one segment, `**` = zero or more). Example for a record query tool:

```json
{
  "mock_expectations": [
    {"id": "agent-def", "method": "GET", "path": "/api/v1/agents/*", "response": {"status": 200, "body": {"uuid": "...", "tools": [...]}}},
    {"id": "record-type", "method": "GET", "path": "/api/v1/record-types/*", "response": {"status": 200, "body": {"fields": [...]}}}
  ]
}
```

Tip: check your server's handler code to see what LCP API calls it makes, then mock each one.

### 2. `<module>/test/integration/run.sh`

```bash
#!/usr/bin/env bash
# Thin wrapper — delegates to the shared integration test runner.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../../../test/integration/run.sh" "${SCRIPT_DIR}/test-config.json"
```

Make executable: `chmod +x <module>/test/integration/run.sh`

## Post-Generation Steps

After generating the files, tell the user:

1. **Add CI job** to `.gitlab-ci.yml` (copy the pattern from the existing integration test jobs):

```yaml
Integration Test [{{service_label}}]:
  stage: Test
  extends:
    - .executor-arch-arm64
  image: ${CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX}/golang:1.25
  variables:
    CLUSTER_DOMAIN: "dev-01.1-29.us-east-1.k8s.dev.appian-internal.com"
  script:
    - apt-get update -qq && apt-get install -y -qq curl openssl jq > /dev/null
    - SIM=$(echo "sim-$CI_COMMIT_REF_SLUG" | cut -c1-33 | sed 's/-$//')
    - DOMAIN="${ARGOCD_TOOLS_CLUSTER_DOMAIN:-$CLUSTER_DOMAIN}"
    - export GATEWAY_URL="https://${SIM}.${DOMAIN}"
    - export MOCK_SERVER_URL="https://${SIM}-mock.${DOMAIN}"
    - test/integration/run.sh {{module}}/test/integration/test-config.json
  needs:
    - create_dev_deployment
    - "Docker Build [{{module}}]"
    - "Docker Build [mock-server]"
  rules:
    - if: $CI_PROJECT_NAMESPACE == "appian/dev"
```

2. **Add server to sim** — either use `simToolServers` in the sim values override (for branch deploys) or create dedicated Helm templates (for production).

3. **Pick a unique site_id** — each server uses its own to prevent KAS key race conditions in parallel CI:
   - `100` = platform-test-tools
   - `200` = customer-mcp-tools
   - `300+` = available for new servers

## Validation

After generating, run locally to verify config parsing:
```bash
timeout 5 test/integration/run.sh <module>/test/integration/test-config.json
```

Should print the header with correct name, site_id, and URNs before blocking at service wait (expected without local services running).
