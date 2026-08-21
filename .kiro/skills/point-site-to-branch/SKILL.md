---
name: point-site-to-branch
description: Points a sites-dev site to the current branch's tool-platform deployment. Use when the user says "point my site to this branch", "route my site here", "test against my branch", or provides a site ID/URL and wants it to use their dev deployment. Patches the appian-custom-properties configmap and mcp ExternalName service.
---

# point-site-to-branch

This skill patches a sites-dev site to route MCP traffic to the current branch's tool-platform gateway deployment.

## Scripts

This skill provides two shell scripts that can be used directly or by the agent:

- **`point-to-branch.sh <site-id>`** — Points a site to the current branch's deployment. Use `--revert` to switch back to main.
- **`point-to-branch.sh --sim <site-id>`** — Points a site to the branch's **sim** deployment (includes mock server, platform-test, and python test servers).
- **`resolve-site.sh <url-or-hostname>`** — Resolves a site URL to its numeric site ID via k8s ingress lookup.

```bash
# Point site to current branch (main deployment)
.kiro/skills/point-site-to-branch/point-to-branch.sh 2360231

# Point site to sim deployment (test tools available)
.kiro/skills/point-site-to-branch/point-to-branch.sh --sim 2360231

# Revert to main
.kiro/skills/point-site-to-branch/point-to-branch.sh --revert 2360231

# Resolve URL to site ID
.kiro/skills/point-site-to-branch/resolve-site.sh https://my-site.dev.appian-sites.net
```

## Inputs

The user provides ONE of:
1. **Numeric site ID** — e.g., `2360231`
2. **Site URL** — e.g., `https://my-site.dev.appian-sites.net` or `my-site.dev.appian-sites.net`

If they provide a URL, resolve it to a site ID (see Resolution below).

## Resolution: URL → Site ID

When the user provides a URL instead of a numeric site ID:

1. Extract the hostname from the URL (strip `https://`, trailing paths)
2. Query k8s ingresses to find which namespace owns that hostname:
   ```bash
   kubectl get ingress -A -o json | jq -r --arg host "<hostname>" \
     '.items[] | select(.spec.rules[]?.host == $host) | .metadata.namespace'
   ```
3. The namespace IS the site ID

If no ingress matches, tell the user the hostname wasn't found and ask for the numeric site ID directly.

## Credential Errors

If any `kubectl` command fails with:
- `error: You must be logged in to the server`
- `Unable to connect to the server`
- `the server has asked for the client to provide credentials`
- `expired` in the error message

Then:
1. Tell the user their cluster credentials have expired
2. Explain that `sso-credentials` requires browser-based SSO and cannot be run from within Kiro
3. Ask them to run this in their terminal (see [sso-credentials docs](https://docs.appian-stratus.io/clusters/access-requests/sso-credentials.html#option-2-using-sso-credentials)):
   ```bash
   sso-credentials sites-dev EKSClusterAdmin
   ```
4. Ask the user to start a new Kiro session after authenticating (the credentials will be picked up by kubectl in the new session)
5. Do NOT attempt to run `sso-credentials` yourself — it requires interactive browser auth

## Execution

### 1. Determine the branch name

```bash
BRANCH=$(git branch --show-current | tr '/' '-' | cut -c1-33 | sed 's/-$//')
```

### 2. Verify the branch deployment exists

```bash
kubectl get deploy -n tool-platform -l app.kubernetes.io/instance=tool-platform-${BRANCH} --no-headers
```

If no deployments are found, tell the user their branch hasn't been deployed yet. The CI pipeline deploys on push — they should check that CI has completed.

### 3. Patch the configmap

```bash
kubectl get configmap appian-custom-properties -n ${SITE_NS} -o json \
  | jq --arg url "http://tool-platform-${BRANCH}-gateway.tool-platform.svc.cluster.local:8080" \
    '.data["custom.properties"] |= gsub("conf.lcp-mcp-server.serviceUrl=.*"; "conf.lcp-mcp-server.serviceUrl=\($url)")' \
  | kubectl apply -f -
```

If the property doesn't exist yet in the configmap (gsub matches nothing), append it instead:
```bash
kubectl get configmap appian-custom-properties -n ${SITE_NS} -o json \
  | jq --arg url "http://tool-platform-${BRANCH}-gateway.tool-platform.svc.cluster.local:8080" \
    '.data["custom.properties"] += "\nconf.lcp-mcp-server.serviceUrl=\($url)"' \
  | kubectl apply -f -
```

### 4. Patch the mcp ExternalName service

```bash
kubectl patch svc mcp -n ${SITE_NS} -p \
  "{\"spec\":{\"externalName\":\"tool-platform-${BRANCH}-gateway.tool-platform.svc.cluster.local\"}}"
```

### 5. Confirm to the user

Tell the user:
- ✅ Site `<site_id>` now points to branch `<branch>`
- The configmap change hot-deploys within ~1 minute
- The service patch takes effect in ~10 seconds
- To revert, run the skill again and say "point to main" (or they can manually set the serviceUrl back to `http://tool-platform-gateway.tool-platform.svc.cluster.local:8080`)

## Revert Flow

If the user says "revert", "point to main", or "reset":

```bash
SITE_NS=<site_id>

kubectl get configmap appian-custom-properties -n ${SITE_NS} -o json \
  | jq '.data["custom.properties"] |= gsub("conf.lcp-mcp-server.serviceUrl=.*"; "conf.lcp-mcp-server.serviceUrl=http://tool-platform-gateway.tool-platform.svc.cluster.local:8080")' \
  | kubectl apply -f -

kubectl patch svc mcp -n ${SITE_NS} -p \
  '{"spec":{"externalName":"tool-platform-gateway.tool-platform.svc.cluster.local"}}'
```

## Error Handling

- **Site not found**: If the configmap or service doesn't exist in the namespace, the site ID is wrong. Ask the user to verify.
- **Branch not deployed**: If no deployment exists for the branch, tell the user to push and wait for CI.
- **Credentials expired**: Follow the credential error flow above.
