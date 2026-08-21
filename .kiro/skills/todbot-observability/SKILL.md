---
name: todbot-observability
description: Gives a recon-todbot eyes on a branch deployment of the AI Tools Platform — pod logs, OTel traces, and pod metrics — and defines how instrumentation added during a hunt is ledgered and later cleaned up. Use when Tod is probing which observability channels are live at G0, when a recon-todbot needs to find where a failure originates, when a log line is not enough to name a path:line, or when rating instrumentation for keep/downgrade/remove at G4. Provides probe.sh, logs.sh, traces.sh, metrics.sh and the OTel trace-sink design. Do not use for local service logs (that is NedOps `logs`) or for production monitoring.
---

# todbot-observability

Not all observability is a log line. A recon-todbot's job is to name a `path:line` **backed by
evidence that execution reached that point in that state** — and the cheapest instrument that proves
it varies by bug.

## The ladder

| Rung | Instrument | Answers | Cost |
|---|---|---|---|
| 1 | **existing logs** | what blew up, roughly where | free |
| 2 | **traces** | which span was last to succeed, and what the next one did | free if a sink exists |
| 3 | **added log lines / spans** | the exact branch taken, the actual value | a deploy cycle + cleanup debt |
| 4 | **metrics** | saturation, leaks, pool exhaustion | free to read, rarely the answer |

Climb from the top. Rung 3 is where most reconnaissance ends up, and it is the only rung that leaves
debt — hence the ledger.

## Probe first (G0)

```bash
.kiro/skills/todbot-observability/probe.sh
```

Prints which channels are live for the current branch's deployment. Tod records the table in
`preconditions.md`. A dark channel is a constraint, not an excuse — recon degrades to logs and says
so under *What I did not check*.

## Logs

```bash
S=.kiro/skills/todbot-observability
$S/logs.sh --since 10m
$S/logs.sh --since 30m --grep 'ERROR|Exception|trace_id'
$S/logs.sh --container gateway --tail 200
$S/logs.sh --previous                      # the crashed instance, after a restart
$S/logs.sh --follow --grep 'tool.resolve'  # then provoke the failure in another window
```

Scoped to `app.kubernetes.io/instance=tool-platform-<branch-slug>` in the `tool-platform` namespace —
the same label the `point-site-to-branch` skill uses, so if that skill worked, these do too.

`--follow` in one window while provoking the failure in another is the highest-yield move available
here: you see the log arrive in the same second as the request, which removes all the guesswork about
which line belongs to your call.

**kubectl can't reach the cluster?** Credentials expire. `sso-credentials sites-dev EKSClusterAdmin`
is interactive and cannot be run from inside an agent session — the user runs it in their own
terminal and starts a new session.

## Traces

```bash
$S/traces.sh --trace-id 4bf92f3577b34da6a3ce929d0e0e4736
$S/traces.sh --search 'tool.resolve' --limit 5
```

See `otel-trace-sink.md` — the platform pushes OTLP out, so a sink is needed before anything can be
pulled back. Two options: a collector with a file exporter that we `kubectl exec` and grep
(recommended for dev, ~40 lines of YAML), or an existing Tempo/Jaeger query API. Neither is deployed
yet; `traces.sh` speaks to both.

A trace beats an added log line when the question is *"how far did it get"*, because it already
carries the parent chain and the attributes — nobody had to guess in advance what to log.

## Metrics

```bash
$S/metrics.sh --grep 'jvm_memory_used|http_server_requests'   # scrape the pod directly
$S/metrics.sh --query 'rate(http_server_requests_seconds_count[5m])'  # if a query API is configured
```

The default path `kubectl exec`s into the pod and scrapes the same `/metrics` endpoint Grafana
scrapes — no Grafana credentials, no dashboards, no new access. Reach for this for **resource-class
bugs only**: memory leaks, CPU saturation, connection-pool exhaustion. For everything else a metric
confirms that something is wrong, which you knew when the bug was filed.

## Adding instrumentation

recon-todbot may add observability. It may not change behaviour. The line is exact:

| Allowed | Not allowed |
|---|---|
| a log statement, a span, a counter, a timer | changing a condition or a default |
| a debug endpoint behind a flag, off by default | changing order of operations |
| a curl script, a seed script, a local harness | changing an error path or a schema |
| raising an existing logger's level in dev config | anything observable with the instruments removed |

Tod reads the diff at G1. A behaviour change fails the gate.

**Layer, don't spray.** Add the minimum that narrows the search, deploy, *look*, then add the next
layer. Twenty lines added at once finds the bug and leaves a mess nobody wants to keep — and the
messier the ledger, the more likely the cleanup bead gets waved through.

Remember the loop time: instrumentation only exists in the deployment once CI has rebuilt it. Push,
wait, re-run — and write down how long that takes, because the next bot needs to plan around it.

## The ledger

Every instrument is recorded **as it is added**, in the repro guide:

| # | What | Where (`path:line`) | Level | Why |
|---|---|---|---|---|
| 1 | span `tool.resolve` around resolver lookup | `ToolSpecResolver.java:88` | INFO | shows which resolver claimed the URN |

At G4 the verification recon rates each row:

- **keep** — genuinely useful permanent observability. The bar: *would I have wanted this before I
  knew about this bug?*
- **downgrade** — right idea, wrong level. INFO in a hot path becomes DEBUG.
- **remove** — scaffolding.

Default to `remove`. Tod files one bead for Flanders with the downgrades and removals, and the
mission is not finished until that bead exists. Instrumentation added during a hunt and never removed
is how a service ends up shouting through every request, and once it's shouting nobody reads it —
which costs you the next investigation.
