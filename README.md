# `.kiro` — the agent module for **ai-tools-platform**

A working copy of the `.kiro/` module from the ai-tools-platform repo, kept here so the agents can be
refined without a full project checkout around them. Changes made here are contributed back upstream.

The premise, stated as an aphorism someone else got to first: **ditch the prompts, keep the graphs.**
A prompt is a local instruction; a graph is a system. What is durable about this module is not any
one agent's voice — it is which agent runs when, what artifact crosses each edge, and what has to be
true before an edge can be taken.

## The roster

Every agent is a Simpsons character with exactly one job. One agent, one task: an agent that occupies
two positions needs the union of two tool sets and one model tuned for two different context
profiles, and both compromises show up as bad work.

| Agent | Job | Writes | Exits |
|---|---|---|---|
| **Dr. Nick** | package design — decisions and must-know context, next to the code | `<pkg>/.steering/`, `<pkg>/.design/adrs/`, `docs/.pitches/` | `DESIGNED` `SHAPED` `NEEDS-SURVEY` `NOT-A-DESIGN-PROBLEM` |
| **Frink** | *legacy* design — the monolithic docs | `design/*.md` | `DECOMPOSE` |
| **Willie** | planning and **package allocation** | `.kiro/plans/`, beads | `PLANNED` `DESIGN-SMELL` `SURVEYED` |
| **Flanders** | build, and prove it live | source, tests, commits | `BEAD-DONE` `BEAD-WRONG` `DESIGN-DEFECT` `NEEDS-REPRO` |
| **Tod** | bug orchestration — commands todbots, writes no code | `.kiro/tod/<bead>/` only | `BUG-ELIMINATED` `NO-REPRO` `DESIGN-DEFECT` `NEEDS-HUMAN` `DEFER` |
| **Bart** | harvest — designed vs. built, and re-wire the anchors | steering *frontmatter*, `drift.lock` | `HARVESTED` `HARVEST-BLOCKED` |
| **Lisa** | read-only investigation, on demand | nothing | returns to its caller |
| **Comic Book Guy** | pattern oracle over a ~300-pattern corpus | nothing | returns to its caller |

**todbots** — `recon`, `sim`, `terminator` — are not in this table because they are not states. They
are Tod's workers, and they run in tmux windows rather than as Kiro sub-agents.

```
.kiro/docs/agent-graph.mermaid    the state machine — who runs after whom, and on which emit
.kiro/docs/tod-mission.mermaid    Tod's delegation tree — deliberately a different shape
```

Read the first as *"where the work goes next"*, the second as *"who this agent calls"*. They should
never share an arrowhead.

## Two things this module does that are worth explaining

### 1 · The bug path is a graph with mechanical gates

A bug signal goes to **Tod**, who orchestrates and never touches code himself:

```
recon-todbot   reproduce it for real, instrument until the defect has a path:line
sim-todbot     write a test that SHOULD pass and fails — the failure IS the bug
terminator     make it pass without touching the test
recon-todbot   fresh context, re-run the original steps, confirm it's gone
```

Each transition is a gate, and each gate is checked against a **file on disk**, not against a bot's
account of itself. Two of them are mechanical rather than editorial, which is the part that makes
this different from a checklist:

- **"Don't change the test"** is enforced by `git hash-object` on every test file, recorded at G2 and
  re-checked at G3. A changed hash is an automatic reject.
- **"Don't change behaviour while instrumenting"** is enforced by Tod reading recon's diff at G1.

The todbots run in **tmux** rather than as Kiro sub-agents for three reasons: a stuck bot can be
nudged, a human can attach and take over the same live session, and a crash costs the tail of a run
instead of everything the bot learned. The cost is that nothing supervises them automatically — which
is why Tod exists, and why two unanswered nudges hand the session to a human rather than trying a
third time.

### 2 · Design knowledge lives inside the package

Instead of one large document per feature:

```
<package>/
  .steering/<topic>.md          what IS. ≤120 lines. Read in full on entry. Bound to code by drift.
  .design/adrs/NNNN-*.md        why. Immutable — superseded, never edited.
  .design/DESIGN_CHANGELOG.md   when the design moved.
  .design/guides/*.md           ephemeral. Willie consumes and deletes.
```

Three properties fall out of that layout:

- **Bounded context per package.** An agent entering a package reads that package's steering, not the
  feature's whole history. The 120-line cap is a forcing function: over it means the package owns two
  things, or the doc is narrating code.
- **Staleness is detectable.** Steering frontmatter carries a `covers:` list, projected into
  `drift.lock` by `link-steering.sh`, and `drift check` fails CI when bound code changes and the doc
  doesn't. Only **Bart** re-stamps — re-stamping asserts "I looked, and it's still true", and letting
  the implementer make that assertion about their own change is how docs become decorative.
- **Decisions survive their authors.** ADR frontmatter is a scan surface: Dr. Nick reads every head in
  a package and opens only the bodies where `reversal_cost: high` or where he's about to contradict
  something.

The loop that keeps it honest is the **harvest**. Flanders records commits, decisions (with the
options that lost), and deviations in every close reason. Bart reads those against the actual diff
and judges each gap `FOLLOWED` / `ADAPTED` / `DID-NOT-FOLLOW` / `UNDECIDABLE` — routing docs-stale to
Dr. Nick and code-is-wrong to Willie. Getting that distinction right is the whole value of the step:
rewriting a doc to match code that ignored a decision is how a system forgets it ever made one.

## Layout

```
.kiro/
  agents/          one JSON per agent — model, tools, resources
  prompts/         the system prompts
    bead-conventions.md            labels, routing, dependencies, exits, close reasons
    knowledge-graph-conventions.md packages, steering, ADRs, drift, traversal
    todbots/                       the three worker prompts
  skills/          procedures agents load on demand
    steering-doc/    templates + validate.py for steering and ADRs
    drift-anchors/   covers: → drift.lock projection
    pitch-doc/       ShapeUp pitches — house format + craft guidance
    todbot-tmux/     spawn, peek, wait, nudge, teardown + the sentinel protocol
    todbot-auth/     credentials in, never out
    todbot-observability/  logs, traces, metrics + the OTel sink design
    todbot-pipeline/ glab + the push policy
    commit/, claims-table/, frink-design-doc/, scaffold-*/, point-site-to-branch/
  ci/              drift.gitlab-ci.yml — the staleness gate
  docs/            WIRING.md (setup) + the graphs
  mcp/nedops/      the dev-session MCP server (Go)
  corpus/          Comic Book Guy's pattern corpus
  todbots.config.sh   todbot knobs; override in todbots.config.local.sh (gitignored)
```

## Using it

```bash
# validate everything structural
python3 .kiro/skills/steering-doc/scripts/validate.py --self-test
python3 .kiro/skills/steering-doc/scripts/validate.py --all
for f in .kiro/agents/*.json; do python3 -m json.tool "$f" >/dev/null || echo "BAD $f"; done

# what covers the file I'm about to change?
drift refs src/main/java/com/appian/mcp/tools/ToolSpecResolver.java

# start a bug mission
.kiro/skills/todbot-tmux/mission-init.sh bd-a1b2
```

`drift` is [fiberplane/drift](https://github.com/fiberplane/drift) —
`brew install fiberplane/tap/drift`.

## Standing it up in the project

Some of this needs things to exist outside `.kiro/` — a binary installed, a CI job included, a config
filled in, a pod deployed. **[`.kiro/docs/WIRING.md`](.kiro/docs/WIRING.md)** walks through it in five
phases, ordered so each is independently useful and independently revertible:

| Phase | Gives you | Cost |
|---|---|---|
| 1 · Agents | Dr. Nick, Tod, Bart on the roster | ~10 min |
| 2 · Drift tooling | the binary + the ignores, ready to bind docs | ~15 min |
| 3 · CI gates | staleness and schema failures caught on the MR | ~30 min |
| 4 · Todbots | the bug-elimination mission loop | ~30 min |
| 5 · Trace sink | recon reads traces, not just logs | ~1 hr, optional forever |

Phase 1 alone gets you the new agents. Nothing later is a prerequisite for anything earlier, and
**every phase installs machinery — none of them writes a document.** The first steering doc arrives
with the first real design ticket, not as a setup step: a doc written to exercise the tooling is a
doc nobody needed, which is the failure this design exists to prevent.

Run the phases with **Flanders** in freeform (the guide is already the decomposition). The one part
that isn't his is the first steering doc — writing steering prose is a design act, so that's Dr.
Nick, on a real ticket.

## Known gaps

- **The OTel trace sink is designed, not deployed.** `.kiro/skills/todbot-observability/otel-trace-sink.md`
  has the manifest; until it lands, recon works from logs and says so.
- **Cluster-signed JWTs for branch deployments are not wired.** The user pastes a token; `store.sh`
  keeps it out of the logs. The shape of the automated path is documented in `todbot-auth/SKILL.md`.
- **`drift check` in CI ships `allow_failure: true`.** Flip it once real packages are linked; a gate
  that fires on day one for unbound docs gets disabled in a week and never comes back.
