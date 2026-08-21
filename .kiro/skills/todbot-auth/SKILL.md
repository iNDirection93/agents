---
name: todbot-auth
description: Gets a todbot authenticated against a branch deployment of the AI Tools Platform without leaking the credential. Use when Tod is setting up mission preconditions and needs to decide between a site JWT and an API key, when a recon-todbot returns BLOCKED:AUTH, when a curl against the branch deployment returns 401 or 403, or when a credential needs to be handed from the user's conversation down to a bot. Provides store.sh (stdin-only credential capture into a 0600 .env.auth), check.sh (proves it works without printing it), and the JWT-minting paths for local gdev and cluster-signed tokens. Do not use for storing long-lived project secrets or for any credential the user has not deliberately provided for this mission.
---

# todbot-auth

A todbot driving a real deployment needs a credential, and the credential must never reach a log, a
report, a bead, or a commit. This skill is the one path in and out.

**The rule: the secret arrives on stdin and leaves through `$TODBOT_AUTH_HEADER`.** It is never an
argument, never an echo, never a value in a mission file. Mission files reference the *path*.

## Choosing a mode (G0, with the user)

| Mode | When | How the credential is obtained |
|---|---|---|
| `api-key` | testing the external/API-key flow, or the user already has a key for the site | the user pastes it |
| `site-jwt` | testing the site-JWT flow against a real site | the user pastes it, or it is minted (below) |
| none | the bug reproduces with no auth (mock mode, local NedOps) | — |

Ask the user directly: *"site JWT or API key?"* The two take different paths through the gateway —
an API key is exchanged for a site JWT by the token-exchange flow; an RS256 site JWT is passed
through. A bug in one path does not reproduce on the other, so guessing wrong wastes a whole recon
run.

Prerequisites the site needs for the API-key path (worth checking before blaming the bot):
`appian.feature.ae.lcp-enabling-team.authentication-apis=true` and
`ae.lcp-enabling-team.k8s-service-account-auth=false`.

## Storing what the user gives you

```bash
# Tod, after the user provides the credential in conversation:
printf '%s' '<the value the user pasted>' \
  | .kiro/skills/todbot-auth/store.sh bd-a1b2 site-jwt
```

Writes `.kiro/tod/bd-a1b2/.env.auth`, mode 0600, gitignored, containing
`TODBOT_AUTH_HEADER='Authorization: Bearer …'`. It prints a **fingerprint** (`cksum` + length) — quote
that in the mission log when you need to refer to which credential was used. Never quote the value.

Then verify it before you spawn anything:

```bash
.kiro/skills/todbot-auth/check.sh bd-a1b2 "$PLATFORM_URL/mcp"
# status 200  → good
# status 401  → wrong mode, expired, or the site's toggles are off
# status 000  → the deployment isn't reachable; that's a G0 problem, not an auth problem
```

A credential that has not passed `check.sh` is not a precondition that has been met.

## Minting instead of pasting

### Local gdev (NedOps)

recon-todbot has `@nedops/get_jwt`. This is the cheapest path when the bug reproduces against gdev
rather than a branch deployment:

```
get_jwt(agent_uuid="…")   →  { jwt, expires_at, lcp_base_url }
```

Check `lcp_base_url` in the response. If it contains log noise or warnings, re-call with an explicit
`lcp_base_url="http://<ip>:8080/suite/lcp/api"` (the real IP is usually at the end of the corrupted
string) — and file a bug against `stripSSHNoise` in `.kiro/mcp/nedops/nedops/gdev_ssh.go`.

### Cluster-signed JWT for a branch deployment — not yet wired

The Java service validates site JWTs against KAS (`McpJwtAuthenticator` + `KasPublicKeyProvider`).
NedOps mints for gdev by signing with a key it pulls over SSH; the same trick against a sites-dev
site needs the site's signing key out of the cluster, and **the secret's name and layout have not
been confirmed for this environment**.

Until someone confirms it, the honest path is: **the user mints or copies a token and pastes it.**
That is one message in the conversation and it is not the bottleneck anyone expects it to be.

If you want to wire it up, the shape is:

```bash
# .kiro/todbots.config.local.sh
TODBOT_JWT_KEY_SECRET=<secret-name>     # k8s secret holding the site signing key
TODBOT_JWT_KEY_FIELD=<key-in-secret>    # e.g. tls.key
TODBOT_JWT_SITE_ID=<numeric site id>
```

then sign the same claim set NedOps signs (`gdev_jwt.go:signJWT` — site id, agent uuid,
`lcp_base_url`, RS256). **Verify against a real site once before trusting it**, and do not let a bot
mint tokens unattended until it has been verified — a subtly wrong claim set produces 401s that look
exactly like a bug in the thing you are debugging.

## Using it from a bot

```bash
set +x                                        # never trace the command line
source .kiro/tod/<mission-id>/.env.auth       # exports TODBOT_AUTH_HEADER
curl -sS -D- -o /tmp/out.json \
  -H "$TODBOT_AUTH_HEADER" -H 'Content-Type: application/json' \
  -X POST "$PLATFORM_URL/mcp" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Rules for bots:

1. **Never `echo`, `cat`, or interpolate the header into printed output.** The pane is piped to disk.
2. **Never put the value in a report, a bead, a commit, or a mission file.** Reference the path.
3. **Never mint your own credential.** If auth fails, print `TODBOT-BLOCKED:<bot>:AUTH` with the
   status code and body, and stop. Tod re-runs the auth flow with the user.
4. **Never fall back to an unauthenticated call** and describe the result as a reproduction. A 401 is
   not the bug you were sent to find.

## Defence in depth

`spawn.sh` pipes every pane through `redact.sh` before it reaches disk, replacing bearer tokens,
`eyJ…` JWTs, `X-Api-Key`, and `Authorization:` values. That is a safety net for accidents, not a
licence: it only sees what reaches the pane, it cannot un-leak anything a bot pasted into a file, and
a very long token can wrap across a line boundary where the pattern no longer matches.

Expired mid-mission? That is `BLOCKED:AUTH`, not a puzzle. Re-store and resume — the bot keeps its
context, which is the entire reason these things run in tmux.
