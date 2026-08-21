# Wiring guide — standing this up in ai-tools-platform

Everything in `.kiro/` that needs something to exist *outside* `.kiro/` before it works: a binary
installed, a CI job included, a config file filled in, a pod deployed.

**Nothing here has to be done all at once.** The phases are ordered so each one is independently
useful and independently revertible. Phase 1 alone gives you the new agents. Phase 5 is optional
forever.

| Phase | Gives you | Cost | Blocks |
|---|---|---|---|
| 1 · Agents | Dr. Nick, Tod, Bart on the roster | ~10 min | everything |
| 2 · Drift tooling | the binary + the ignores, ready to bind docs | ~15 min | Phase 3 |
| 3 · CI gates | staleness and schema failures caught on the MR | ~30 min | — |
| 4 · Todbots | the bug-elimination mission loop | ~30 min | Tod missions |
| 5 · Trace sink | recon reads traces instead of only logs | ~1 hr, needs cluster access | nothing (degrades) |

All five phases install **machinery**. None of them writes a document. The knowledge graph starts
filling up through normal work — see [Your first steering doc](#your-first-steering-doc-not-a-setup-step)
at the end, which is deliberately *not* a phase.

## Who runs each phase

| Work | Agent | Why |
|---|---|---|
| Phases 1–5, all of it | **Flanders**, freeform | binaries, config files, CI includes, manifests. `infra` is his area, and he tests live. |
| The first steering doc + ADRs | **Dr. Nick** | writing steering prose is a design act; Flanders is explicitly forbidden from it |
| Interactive auth (`glab auth login`, `sso-credentials`) | **you**, in your own terminal | browser SSO cannot run inside an agent session |

**Freeform, not Bead Mode.** This guide *is* the decomposition — ordered, named files, verification
checklists. Running Willie to turn a written plan into beads is overhead for work already broken
down; he earns his keep when the breakdown isn't known yet.

---

## Phase 1 · Agents

The new agents are `.kiro/agents/*.json` + `.kiro/prompts/*.md`. If `.kiro/` is already vendored into
the repo, they are already there — they just need Kiro to see them and their tools to exist.

```bash
# 1. NedOps binary — recon/sim/terminator all declare @nedops
bash .kiro/mcp/nedops/install.sh
# then restart the Kiro CLI so it picks up the binary

# 2. Confirm every agent config parses and its prompt resolves
for f in .kiro/agents/*.json; do
  python3 -m json.tool "$f" >/dev/null || echo "BAD $f"
done
```

- [ ] `kiro-cli chat --agent drnick` starts and Dr. Nick introduces himself
- [ ] Same for `tod`, `bart`
- [ ] `bd list --label drnick --status open` runs (beads is already installed for the other agents)

**Check the model IDs.** Allocation and reasoning are in
[`MODELS.md`](MODELS.md) — three Opus seats, five Sol, three Sonnet. One of those strings is a guess:

> `gpt-5.6-sol` is inferred from the naming convention, **not confirmed against the deployment.**
> Confirm it once against whatever your Kiro install accepts, and correct the five JSONs if it
> differs.

Model IDs live only in `.kiro/agents/*.json`; no prompt, skill, or script reads them, so a wrong
string is a one-line fix per file and breaks nothing else.

> `frink.json` references `skill://~/.kiro/skills/visual-explainer/SKILL.md`, a *user-level* skill
> outside this repo. Pre-existing, unrelated to any of this, and harmless if absent.

---

## Phase 2 · Drift tooling

Install the binary and the ignores. **Do not write any documents in this phase** — an empty
`drift.lock` is a correct state, and the first real doc arrives through a design ticket.

### 2.1 Install drift

```bash
brew install fiberplane/tap/drift
# or: curl -fsSL https://drift.fp.dev/install.sh | sh
drift --version
drift check          # no bindings yet — passes trivially. That's the expected state.
```

### 2.2 Add the `.gitignore` entries

The module ships a `.gitignore` in the agents repo; fold the relevant lines into the project's:

```gitignore
# Ephemeral implementation guides — Dr. Nick writes, Willie consumes and deletes.
# One committed here means the workflow broke.
**/.design/guides/

# Todbot mission working material; the repro guide is kept deliberately.
.kiro/tod/*/
!.kiro/tod/*/10-repro-guide.md
.env.auth
.kiro/todbots.config.local.sh
.kiro/harvest/
```

### 2.3 Confirm the projection script runs

`link-steering.sh` reads a steering doc's frontmatter `covers:` list and runs `drift link` for each
entry. With no docs yet there is nothing to link, so just prove the script is reachable:

```bash
.kiro/skills/drift-anchors/link-steering.sh --dry-run --all
# expect: "no steering docs found — nothing to link", exit 0.
# A sweep over an empty set is a legitimate state, not a failure — which is
# what makes it safe to put in CI before the first doc exists.

python3 .kiro/skills/steering-doc/scripts/validate.py --self-test
python3 .kiro/skills/steering-doc/scripts/validate.py --all    # "no steering docs or ADRs found"
```

- [ ] `drift --version` works
- [ ] `drift check` exits 0 with no bindings
- [ ] `validate.py --self-test` is clean
- [ ] A file under any `.design/guides/` is ignored by git

---

## Phase 3 · CI gates

Two jobs, both shipped in `.kiro/ci/drift.gitlab-ci.yml`:

```yaml
# .gitlab-ci.yml
include:
  - local: '.kiro/ci/drift.gitlab-ci.yml'
```

| Job | Runs when | What it catches |
|---|---|---|
| `drift:check` | MR touching `.java`/`.go` | code changed, bound doc didn't |
| `steering:validate` | MR touching `.steering/` or `.design/adrs/` | schema, section order, claim/anchor mismatch, the 120-line cap |

**Both ship `allow_failure: true`, and installing them before any doc exists costs nothing** — with
an empty lockfile they pass trivially. Leave them non-blocking until a few real packages are bound.
A gate that fires on day one for docs nobody has written gets disabled in a week and never comes
back. Flip to `false` when `drift check` is green on main and people have started noticing it.

The job installs drift via the shell installer on each run. If your runners can't reach
`drift.fp.dev`, vendor the binary into your CI image and drop the `before_script` install line.

- [ ] Both jobs appear on an MR and pass
- [ ] Neither fires on unrelated MRs
- [ ] Later, once a doc is bound: an MR editing a bound symbol without its doc goes red

### The red window is deliberate

Once docs are bound, CI stays red between "code landed" and "harvest ran", because **only Bart
re-stamps anchors**. Flanders records `drift check --changed` in his close reason and moves on; Bart
adjudicates at the end of the session — re-stamp if the doc is still true, bead for Dr. Nick if it
isn't.

That window is the mechanism that makes the harvest non-optional. If you find it annoying, the fix
is to run the harvest, not to let implementers re-stamp their own anchors.

---

## Phase 4 · Todbots

### 4.1 Prerequisites

```bash
tmux -V                  # any recent version
glab auth status         # interactive login if needed — run it in your own terminal
kubectl version --request-timeout=5s
```

`glab auth login` and `sso-credentials sites-dev EKSClusterAdmin` are **interactive** and cannot be
run from inside an agent session. When cluster credentials expire mid-mission, that surfaces as
`BLOCKED:ENV` and you re-auth in your own terminal, then start a new session.

### 4.2 Confirm how a Kiro agent is launched

The one value most likely to be wrong. `spawn.sh` runs `$TODBOT_CLI $TODBOT_CLI_ARGS <agent-name>`,
defaulting to `kiro-cli chat --agent`:

```bash
cat > .kiro/todbots.config.local.sh <<'EOF'
# gitignored — personal/machine defaults
TODBOT_CLI=kiro-cli
TODBOT_CLI_ARGS="chat --agent"
TODBOT_READY_WAIT=6        # seconds before the opening prompt is typed
TODBOT_STUCK_SECS=120
TODBOT_NUDGE_MAX=2
EOF
```

Smoke-test the supervision loop without burning tokens, by pointing `TODBOT_CLI` at a shell:

```bash
export TODBOT_CLI=bash TODBOT_CLI_ARGS="-c" TODBOT_READY_WAIT=0 TODBOT_STUCK_SECS=5
S=.kiro/skills/todbot-tmux
$S/mission-init.sh bd-smoke
printf '# smoke\n' > .kiro/tod/bd-smoke/mission-recon.md
$S/spawn.sh bd-smoke recon --no-prompt
tmux send-keys -t "=tod-bd-smoke:recon" 'echo TODBOT-DONE:recon:REPRODUCED' Enter
$S/wait.sh bd-smoke recon --timeout 20 --stuck 60     # expect: DONE:REPRODUCED
$S/teardown.sh bd-smoke --force && rm -rf .kiro/tod/bd-smoke
```

- [ ] `spawn.sh` opens a window and writes a log
- [ ] `wait.sh` returns `DONE:REPRODUCED` (exit 0)
- [ ] `nudge.sh` refuses on the third call with exit 20 and prints the attach command
- [ ] A line containing `Authorization: Bearer eyJ…` lands in the log as `<REDACTED>`

### 4.3 Push policy

Defaults live in `.kiro/todbots.config.sh`: push to the **current mission branch** without asking;
protected branches (`main master dev develop release`) always need explicit human approval recorded
in the mission log. Override per machine in the `.local.sh` file — `TODBOT_PUSH_MODE=ask` if you want
to be asked every time, `off` to forbid pushes entirely.

```bash
.kiro/skills/todbot-pipeline/push.sh --dry-run                 # expect: would push <current branch>
.kiro/skills/todbot-pipeline/push.sh --head-to dev --dry-run   # expect: exit 3, approval required
```

### 4.4 Auth for a mission

Nothing to set up in advance. At G0, Tod asks whether you're testing with a site JWT or an API key,
you paste it, and it goes to a 0600 gitignored file:

```bash
printf '%s' '<the token>' | .kiro/skills/todbot-auth/store.sh bd-a1b2 site-jwt
.kiro/skills/todbot-auth/check.sh bd-a1b2 "$PLATFORM_URL/mcp"    # expect: status 200
```

Cluster-signed JWTs for branch deployments are **not wired** — the secret name and layout haven't been
confirmed for this environment. `todbot-auth/SKILL.md` documents the shape if you want to build it;
verify it against a real site once before letting a bot mint unattended, because a subtly wrong claim
set produces 401s that look exactly like the bug under investigation.

### 4.5 First mission

```bash
.kiro/skills/todbot-tmux/mission-init.sh <bead-id>
kiro-cli chat --agent tod
```

Tod runs G0 himself: branch deployment check, the `point-site-to-branch` skill for the Maverick site,
auth mode, ticket number, and `probe.sh` for observability. He will refuse to spawn anything until
those are written into `preconditions.md`.

---

## Phase 5 · OTel trace sink (optional)

The platform pushes OTLP out; a todbot needs to pull a specific trace back. Without a sink,
`probe.sh` reports `traces: dark`, recon works from logs, and says so under *What I did not check*.
Everything still functions.

`.kiro/skills/todbot-observability/otel-trace-sink.md` has two options:

- **File sink (recommended for dev)** — an OTel Collector with a file exporter; the agent
  `kubectl exec`s in and greps by trace id. ~40 lines of YAML, no query service, no new access.
- **Existing Tempo/Jaeger** — set `TODBOT_TRACE_SINK_URL` and skip the manifest.

```bash
# after deploying the collector
cat >> .kiro/todbots.config.local.sh <<'EOF'
TODBOT_TRACE_SINK_POD=$(kubectl get pod -n tool-platform -l app=otel-trace-sink \
  -o jsonpath='{.items[0].metadata.name}')
TODBOT_TRACE_SINK_FILE=/data/traces.jsonl
EOF
.kiro/skills/todbot-observability/probe.sh    # expect: traces live
```

**Sampling matters more than storage.** A todbot provokes one request and needs *that* trace.
`OTEL_TRACES_SAMPLER=always_on` in dev; head sampling at 1% means the evidence the bot just created
is gone.

Metrics need no setup — `metrics.sh` scrapes the pod's own `/metrics` endpoint through `kubectl exec`,
the same endpoint Grafana scrapes. Reach for it only on resource-class bugs (leak, CPU, pool
exhaustion); for everything else a metric confirms something is wrong, which you knew.

---

## Your first steering doc — not a setup step

The machinery is now installed and every gate passes on an empty lockfile. **Do not now go and write
a steering doc to prove it works.**

A doc written to exercise the tooling is a doc nobody needed — which is precisely the failure this
whole design exists to prevent. It will be accurate on the day it's written, nobody will have reason
to read it, and it will rot into the thing that makes people distrust the rest. That is the
touch-to-migrate rule (`knowledge-graph-conventions.md` §9) applied to the bootstrap itself.

Instead, **the first real design ticket creates it.** When that lands:

1. Open **Dr. Nick** with the ticket. He walks the tree, reads what exists, and does the design.
2. He writes `<pkg>/.steering/<topic>.md`, the ADRs, and the changelog row — because someone needed
   the design, not because the pipeline needed a fixture.
3. He runs the validator, and `link-steering.sh` if the symbols already exist:
   ```bash
   python3 .kiro/skills/steering-doc/scripts/validate.py --package <pkg>
   .kiro/skills/drift-anchors/link-steering.sh <pkg>/.steering/<topic>.md
   git add drift.lock <pkg>/.steering <pkg>/.design
   ```
4. `drift.lock` gets its first real binding, and CI starts having an opinion.

The validator is strict on purpose, and the two errors people hit first are:

- **frontmatter `claims` and the claims table disagree** — a row was added and the head wasn't, or
  the reverse. It checks both directions.
- **over 120 lines** — the package owns two things, or the doc is narrating code. Fix the cause, not
  the line count.

`SKIP … (file does not exist yet)` from `link-steering.sh` is expected when steering is written
before the code. Leave the doc `status: provisional`; Bart links it at the harvest once the symbols
land.

---

## The bootstrap gap

**Willie can't allocate this work, and Bart can't harvest it.** Say it out loud now so it isn't
alarming later.

The wiring has no owning package with steering — that's what it's setting up — so there are no
`pkg:` labels to assign, and there is no design for the harvest to reconcile the implementation
against. The graph does not close on its own installation.

Practical consequences, all expected:

- Flanders' close reason for wiring work will read `PACKAGES: none` and `DRIFT: n/a`. That's correct,
  not a lapse.
- Don't wait for a `HARVESTED` emit on any of this. There is nothing to harvest.
- Don't file a DECOMPOSE bead for it. This guide is the decomposition.

The graph starts applying to itself with the **first real ticket after Phase 3 lands** — that ticket
gets a package, a steering doc, a `pkg:` label, and a harvest. From then on the loop is closed.

---

## Verification, all phases

```bash
# schemas and structure
python3 .kiro/skills/steering-doc/scripts/validate.py --self-test
python3 .kiro/skills/steering-doc/scripts/validate.py --all
for f in .kiro/agents/*.json; do python3 -m json.tool "$f" >/dev/null || echo "BAD $f"; done
for f in $(find .kiro -name '*.sh' -not -path '*/mcp/*'); do bash -n "$f" || echo "SYNTAX $f"; done

# bindings
drift check
drift status | head -20
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `drift check` passes but finds nothing | no bindings yet | correct after Phase 2 — the first doc arrives with the first design ticket |
| `drift link` fails on a symbol | greenfield — code isn't written yet | leave `status: provisional`; Bart links at harvest |
| `drift check` red right after a merge | correct — the harvest hasn't run | run Bart; don't re-stamp as the implementer |
| `validate.py` errors on claim ids | frontmatter and table disagree | fix both; it checks in both directions |
| todbot window opens and dies instantly | `TODBOT_CLI` wrong | `peek.sh` shows the shell error; fix `todbots.config.local.sh` |
| `wait.sh` returns `STUCK` on a working bot | bot is thinking longer than `TODBOT_STUCK_SECS` | raise it; stuck is "log stopped growing", not a judgement |
| `push.sh` exits 3 | protected branch, no approval | correct — Tod asks you, records it, retries with `TODBOT_PUSH_APPROVED=1` |
| `probe.sh` says everything dark | cluster credentials expired | `sso-credentials sites-dev EKSClusterAdmin` in your own terminal, then a new session |
| A `.design/guides/*` file is in a commit | the gitignore entry is missing | add it; Willie should have deleted the guide after decomposing |
| Flanders closes a wiring bead with `PACKAGES: none` | the bootstrap gap | expected — see above |
