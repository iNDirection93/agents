# Bead Conventions — Shared Tagging & Dependency Standard

All agents (Willie, Frink, Dr. Nick, Flanders, Tod, Bart) follow these conventions when creating, updating, or closing beads. This is the shared contract that keeps work organized and discoverable.

Beads move work along the graph. **`knowledge-graph-conventions.md` defines the graph itself** — where package knowledge lives, how it binds to code, and who may write what. Read that one too if your work touches `.steering/` or `.design/`.

---

## Branch Scoping

**Beads are scoped to git branches.** This is critical because `bd` shares state across git worktrees. Without branch scoping, beads from one worktree bleed into another.

### How It Works

Every bead gets a `branch:<branch-name>` label at creation time. Every bead query filters by the current branch.

**Detecting the current branch:**
```bash
git branch --show-current
```

**Creating a bead (always include branch label):**
```bash
bd create "Do the thing" \
  -l "willie,from-willie,flanders,branch:$(git branch --show-current),pr-plan"
```

**Querying beads (always filter by branch):**
```bash
bd list --label "branch:$(git branch --show-current)" --label willie --status open --json
```

### Rules

1. **Every bead MUST include either a `branch:<name>` label or the `backlog` label.** No exceptions.
2. **Every query MUST filter by `branch:<name>`.** No exceptions. Backlog beads are intentionally invisible to normal workflow — they're checked separately.
3. If the branch name contains slashes (e.g., `feature/foo-bar`), use the full name: `branch:feature/foo-bar`.
4. Beads with neither a `branch:` label nor `backlog` are orphans — they belong nowhere and will be invisible to all agents.

### Backlog Beads

Backlog beads are for work unrelated to the current ticket/branch. They use the `backlog` label in place of `branch:`.

**Agents NEVER create backlog beads on their own.** When an agent discovers something out of scope, they surface it to the user and ask whether to:
1. Add it to the current branch (scope it in)
2. Create a backlog bead (park it for a future ticket)
3. Ignore it

The user can also explicitly ask to create a backlog bead at any time (e.g., "park that for later", "create a backlog task for that", "that's for a different ticket").

**Creating a backlog bead (only when user approves):**
```bash
bd create "Tech debt: RunService error handling swallows stack traces" \
  -d "Discovered during AIPL-456 work but not related to this ticket.

WHAT: RunService.continue_run catches broad Exception and logs only the message, not the traceback.
WHY: Makes debugging production issues much harder.
DONE LOOKS LIKE: Exceptions are logged with full traceback, or re-raised with context." \
  -l "flanders,from-flanders,willie,backlog,agent" \
  -p 2
```

**Querying backlog:**
```bash
bd list --label backlog --status open --json
```

Backlog beads are NOT checked during normal Phase 0 startup. They're reviewed when:
- Starting a new ticket/branch and looking for related work to pull in
- Doing periodic backlog grooming
- A user explicitly asks to check the backlog

---

## Label Taxonomy

### 1. Origin Labels (WHO created it)

Every bead gets exactly ONE origin label identifying who created it:

| Label | Meaning |
|-------|---------|
| `willie` | Created by Willie (planning session) |
| `frink` | Created by Frink (legacy design work, `design/*.md`) |
| `drnick` | Created by Dr. Nick (package steering / ADR design work) |
| `flanders` | Created by Flanders (discovered during implementation) |
| `tod` | Created by Tod (bug orchestration) |
| `bart` | Created by Bart (harvest — design-vs-implementation gaps) |

### 2. Routing Labels (WHO should pick it up)

When a bead is created FOR another agent, add a routing label:

| Label | Meaning |
|-------|---------|
| `from-willie` | Willie created this for someone else to execute |
| `from-frink` | Frink created this (usually a DECOMPOSE bead for Willie) |
| `from-drnick` | Dr. Nick created this (DECOMPOSE or SURVEY for Willie, research for Lisa) |
| `from-flanders` | Flanders created this (escalation to Willie, Dr. Nick, or Tod) |
| `from-tod` | Tod created this (cleanup, design defect, or deferred work from a mission) |
| `from-bart` | Bart created this (doc gap, ADR needed, or missing steering) |

**Self-addressed beads are valid.** An agent can create a bead for itself (e.g., Willie parking a note for future-Willie). In that case, both the origin and the recipient are the same:
```bash
# Willie creates a bead for future-Willie
bd create "Revisit pagination approach after Frink's design" \
  -l "willie,from-willie,willie,branch:$(git branch --show-current),pr-plan"
```

Routing labels tell the RECIPIENT to check for incoming work. The pattern is simple — one query per agent:

```bash
BRANCH=$(git branch --show-current)

# Any agent checks for work assigned to it on this branch:
bd list --label willie   --label "branch:$BRANCH" --status open
bd list --label frink    --label "branch:$BRANCH" --status open
bd list --label drnick   --label "branch:$BRANCH" --status open
bd list --label flanders --label "branch:$BRANCH" --status open
bd list --label tod      --label "branch:$BRANCH" --status open
bd list --label bart     --label "branch:$BRANCH" --status open
```

The `from-X` labels are for **provenance** (knowing who created a bead), not for querying. The recipient label + branch is all you need to find your work.

### 3. Area Labels (WHAT part of the codebase)

Use exactly ONE primary area label per bead. These map to the service boundaries in this project:

| Label | Covers |
|-------|--------|
| `mcp-server` | `gateway/mcpServer/` — the Go MCP protocol server (stdio + HTTP transport, tool routing) |
| `java-tools` | `src/main/java/` — the Java tools service (tool definitions, handlers, LCP API clients) |
| `infra` | `docker/`, `charts/`, `deploy/`, `.gitlab-ci.yml` — Docker, Helm, CI/CD, deployment |

For beads that cross boundaries, use the area where the PRIMARY code change lives. Add the second area only if significant code changes happen in both.

#### Package labels (`pkg:<path>`)

Service-level area labels are coarse. Once a package carries its own `.steering/` (see
`knowledge-graph-conventions.md`), beads that touch it also get a package label:

```
pkg:gateway/mcpServer/internal/transport
pkg:src/main/java/com/appian/mcp/tools/records
```

Rules:

1. **Willie assigns `pkg:` labels during planning.** One per bead where the owning package is known;
   two only when the change genuinely straddles a boundary (and that's a signal worth questioning).
2. **Keep the service area label too.** `pkg:` narrows, it doesn't replace — queries by `java-tools`
   must still find the bead.
3. **A bead with no owning package is a planning gap, not a free pass.** If Willie can't name the
   package, either the package doesn't exist yet (propose it) or the change is misallocated.
4. Bart uses `pkg:` labels at harvest to find which steering docs a session should have touched.

### 4. Work-type Labels

| Label | Meaning |
|-------|---------|
| `design` | Design/architecture work (Frink territory) |
| `thought-work` | Needs thinking before implementation (Frink) |
| `decompose` | Frink's design is done, Willie needs to break it into impl beads |
| `pr-plan` | Part of a Willie planning session |
| `foundation` | Must be done first — other beads depend on this |
| `core` | Main implementation work |
| `cleanup` | Refactoring, docs, polish — important but non-blocking |
| `backlog` | Not tied to any branch — discovered work for future tickets |
| `signal` | A bug/incident report awaiting triage (Tod territory) |
| `repro` | Reproduction, instrumentation, or verification work in a Tod mission |
| `survey` | Read-only reconnaissance: map a change across packages (Dr. Nick → Willie) |
| `steering` | Create or update a package `.steering/` doc (Dr. Nick territory) |
| `adr` | Record a design decision as an ADR (Dr. Nick territory) |
| `rename` | A package/symbol name is misleading and should change |
| `harvest` | Reconcile what was designed against what was built (Bart territory) |

### 5. Risk/Complexity Labels (optional)

| Label | Meaning |
|-------|---------|
| `risky` | Might bite you — review carefully |
| `straightforward` | Simple, well-understood change |

### 6. Model Labels

Most beads run on the recipient agent's default model. When Willie's investigation says a bead needs
more than that, he says so on the bead — he is the one who read the code before writing it, so the
assessment belongs at planning time, not mid-session.

| Label | Meaning | Who opens what |
|-------|---------|----------------|
| *(none)* | the recipient's default | `flanders` |
| `model:opus` | needs sustained judgement over a tangle | `flanders-deep` |

**Only Willie assigns this**, and only from evidence he already has (see his Phase 4a). An agent does
not re-label its own bead: a session struggling with a bead is the least reliable judge of whether
the bead was mis-allocated, which is the same reason implementers don't re-stamp their own drift
anchors.

If a bead turns out to need more than it was given, that is `BEAD-WRONG` → Willie re-plans and
re-labels. The correction path already exists; it does not need a new mechanism.

### 7. Session Tags

Willie tags every bead in a planning session with `willie-{4-hex}`. This groups related beads:

```bash
bd list -l willie-b7e3  # All beads from this planning session
```

Frink and Flanders do NOT create session tags. Only Willie does.

---

## Required Labels Per Agent

### Willie creates beads with:
```
willie, willie-XXXX, from-willie, flanders, branch:<name>, <area>, pr-plan, [work-type], [risk]
```
For thought-work beads routed to Frink:
```
willie, willie-XXXX, from-willie, frink, branch:<name>, thought-work, design, <area>, pr-plan
```
For self-addressed beads:
```
willie, willie-XXXX, from-willie, willie, branch:<name>, <area>, pr-plan
```

### Frink creates beads with:
```
frink, from-frink, branch:<name>, <area>
```
For DECOMPOSE beads routed to Willie:
```
frink, from-frink, willie, branch:<name>, decompose, <area>, pr-plan
```
For self-addressed beads:
```
frink, from-frink, frink, branch:<name>, design, <area>
```

### Flanders creates beads with:
```
flanders, from-flanders, branch:<name>, <area>
```
Plus routing to the right person:
```
flanders, from-flanders, willie, branch:<name>, <area>            # Implementation work needing planning
flanders, from-flanders, drnick, branch:<name>, design, <area>    # Design question needing thinking
flanders, from-flanders, tod, branch:<name>, signal, <area>       # A bug he can't explain — see below
```
For self-addressed beads:
```
flanders, from-flanders, flanders, branch:<name>, <area>
```

### Dr. Nick creates beads with:
```
drnick, from-drnick, branch:<name>, <area>, pkg:<path>
```
For DECOMPOSE beads routed to Willie:
```
drnick, from-drnick, willie, branch:<name>, decompose, <area>, pkg:<path>, pr-plan
```
For SURVEY beads (asking Willie to map a change across packages before design continues):
```
drnick, from-drnick, willie, branch:<name>, survey, <area>
```
For self-addressed beads:
```
drnick, from-drnick, drnick, branch:<name>, design, <area>, pkg:<path>
```

### Tod creates beads with:
```
tod, from-tod, branch:<name>, repro, <area>
```
Routed onward at mission end:
```
tod, from-tod, flanders, branch:<name>, repro, cleanup, <area>   # instrumentation to remove/downgrade
tod, from-tod, drnick, branch:<name>, design, <area>             # DESIGN-DEFECT exit
tod, from-tod, willie, branch:<name>, <area>                     # fix needs planning, not a one-bead job
```

### Bart creates beads with:
```
bart, from-bart, branch:<name>, harvest, <area>, pkg:<path>
```
Routed to Dr. Nick (the common case):
```
bart, from-bart, drnick, branch:<name>, harvest, steering, <area>, pkg:<path>   # docs stale
bart, from-bart, drnick, branch:<name>, harvest, adr, <area>, pkg:<path>        # decision needs an ADR
```
Routed to Willie when the implementation — not the doc — is what's wrong:
```
bart, from-bart, willie, branch:<name>, harvest, <area>, pkg:<path>
```

---

## Dependencies

### Syntax

```bash
bd dep add <blocked-issue> <blocker-issue> --type blocks
```

**This means: the first issue is BLOCKED BY the second issue. Do the second issue FIRST.**

```bash
# Example: Pagination wiring can't happen until the endpoint exists
bd dep add bd-i29v bd-wmma --type blocks
# Read as: "i29v is blocked by wmma" — do wmma first, then i29v
```

### Mnemonic

Think of it as: `bd dep add CHILD PARENT` — the child depends on the parent.

Or: `bd dep add LATER EARLIER` — the later work is blocked by the earlier work.

### Related (non-blocking)

```bash
bd dep add <issue-a> <issue-b> --type related
# These touch the same ground but neither strictly blocks the other
```

### Rules

1. **Design beads block implementation beads.** Always. No exceptions.
2. **Foundation (P0) beads block core (P1) beads** that depend on them.
3. **Don't create circular dependencies.** If A blocks B and B blocks A, something is wrong.
4. **Cross-session deps are fine.** A bead from `willie-b7e3` can depend on a bead from `willie-6e01`.

---

## Priority Semantics

| Priority | Meaning | Who creates |
|----------|---------|-------------|
| P0 | Foundation / design — everything else depends on this | Willie, Frink |
| P1 | Core implementation — the actual work | Willie |
| P2 | Cleanup, polish, future improvements — non-blocking | Willie, Flanders |

Flanders-created beads default to P1 (implementation escalation) or P0 (design escalation).

---

## Design Doc Ownership

**Design docs in `design/` are owned by Frink and users.** This is a hard boundary.

| Agent | Can read design docs? | Can write/modify design docs? |
|-------|----------------------|------------------------------|
| Frink | Yes | Yes — sole agent author |
| Willie | Yes — scans for claim coverage during planning | No — creates a bead for Frink if updates are needed |
| Flanders | Yes — uses claims as test plan | No — updates claim status only (unverified → verified) |
| User | Yes | Yes — users can write/edit design docs directly |

**Claim status updates are the one exception**: When Flanders verifies a claim through testing, he updates the claim's status in the design doc from `unverified` to `verified`. This is a status field change, not a design change.

### Package steering & design records

The newer knowledge graph — `<package>/.steering/` and `<package>/.design/` — has its own ownership
matrix in `knowledge-graph-conventions.md` §8. The short version:

| Agent | `.steering/` body | `.steering/` frontmatter | `.design/adrs/` |
|---|---|---|---|
| Dr. Nick | write | write | write |
| Bart | **no** | write (+ re-stamp `drift.lock`) | read |
| Willie | read | read | read |
| Flanders | read (+ claim status) | read | read |

Legacy `design/*.md` stays Frink's. Nobody migrates it wholesale — packages get steering docs as they
get worked on.

---

## Exit Emits

Every agent session ends by emitting **exactly one exit**, which names the next agent to open. The
emit string goes in the closing bead's title and in an `exit:<EMIT>` label, so the next session is
discoverable without reading prose.

| Agent | Emits | Next |
|---|---|---|
| Dr. Nick | `DESIGNED` | Willie (DECOMPOSE bead) |
| | `SHAPED` | human (pitch is at `docs/.pitches/`) |
| | `NEEDS-SURVEY` | Willie (SURVEY bead) |
| | `NOT-A-DESIGN-PROBLEM` | Willie (plan it directly) |
| Willie | `PLANNED` | Flanders (one session per bead) |
| | `DESIGN-SMELL` | Dr. Nick (or Frink for legacy docs) |
| | `SURVEYED` | Dr. Nick (allocation map returned) |
| Flanders | `BEAD-DONE` | Bart, once the session's beads are all closed |
| | `BEAD-WRONG` | Willie |
| | `DESIGN-DEFECT` | Dr. Nick |
| | `NEEDS-REPRO` | Tod |
| Tod | `BUG-ELIMINATED` | Bart |
| | `NO-REPRO` | closed (signal did not reproduce) |
| | `DESIGN-DEFECT` | Dr. Nick |
| | `NEEDS-HUMAN` | the user |
| | `DEFER` | backlog |
| Bart | `HARVESTED` | done (or Dr. Nick, if he filed doc beads) |
| | `HARVEST-BLOCKED` | the user |

**An unenumerated stop is a dead state machine.** A session that ends without an emit leaves work
nobody will pick up. If no exit fits, emit the closest one and say why in the bead body.

---

## Close-Reason Standard

Bart's harvest can only be as good as what agents record when they close a bead. Every **closing**
bead reason uses these fields. Missing fields are not a style issue — they are the reason a decision
gets silently lost.

```bash
bd close bd-a1b2 --reason "COMPLETED and TESTED.
COMMITS: a3f9d21, b7c2e10
PACKAGES: gateway/mcpServer/internal/transport
DECISIONS:
  - Auth check placed at the transport edge rather than per-handler.
    OPTIONS: transport-edge filter | per-handler guard | middleware chain
    CHOSE transport-edge BECAUSE handlers must stay ignorant of auth; reversal: medium
DEVIATIONS: none
CLAIMS: TRANS-001 verified, TRANS-002 implemented
DRIFT: transport.md 1 anchor stale (ServeHTTP) — content still accurate"
```

| Field | Required | Why it exists |
|---|---|---|
| `COMMITS:` | yes | Bart diffs these. Without SHAs the harvest is guesswork. |
| `PACKAGES:` | yes | tells Bart which `.steering/` should have been touched |
| `DECISIONS:` | when any were made | each with **OPTIONS considered**, the choice, why, and reversal cost — this is what Bart promotes into ADRs |
| `DEVIATIONS:` | yes (`none` is a valid answer) | what the design said vs what you did; Bart judges whether the doc or the code is wrong |
| `CLAIMS:` | when claims were in play | which moved to `implemented` / `verified` |
| `DRIFT:` | yes when code changed | result of `drift check --changed <paths>`; Flanders records, **Bart re-stamps** |

**One decision per entry. "OPTIONS: none" is almost always false** — if there was genuinely only one
way, say so explicitly rather than omitting the field.

---

## Bead Lifecycle

```
              Willie plans (scans design/ for claim coverage)
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    thought-work    impl bead     impl bead
    (no claims)   (has claims)  (has claims)
    (for Frink)   (for Flanders)
          │
    Frink designs
    (writes design doc + claims)
          │
    DECOMPOSE bead ──→ Willie decomposes (maps claims to beads)
    (from-frink)            │
                      more impl beads
                      (each references claims)
                      (for Flanders)
                            │
                   Flanders implements
                   (tests against claims → verified)
                      │         │
                 close bead   escalate
                 (close-reason  (from-flanders)
                  standard)         │
                      │      ┌──────┼──────┐
                      │      ▼      ▼      ▼
                      │  willie  drnick   tod
                      │  (plan)  (design) (can't explain it)
                      ▼
              all session beads closed
                      │
                 Bart harvests
        (diff vs design; frontmatter + drift re-stamp)
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   drnick bead              willie bead
   (docs stale / ADR)   (implementation didn't follow design)
```

### The bug path

```
   signal (user, alert, Flanders can't explain it)
                      │
                    Tod  ── G0 preconditions: branch deploy + site + auth
                      │
        ┌─────────────┼─────────────┬──────────────┐
        ▼             ▼             ▼              ▼
  recon-todbot   sim-todbot   terminator-    recon-todbot
  (reproduce +   (failing      todbot         (verify clean +
   instrument)    test)        (make it green) rate instruments)
        └─────────────┴─────────────┴──────────────┘
                      │   each gate checked by Tod against a durable artifact
                      ▼
             BUG-ELIMINATED → Bart harvests
```

Todbots are **not** beads and **not** Kiro sub-agents — they are tmux sessions Tod supervises. Only
Tod's mission bead exists in `bd`.

---

## Quick Reference: Finding Work

```bash
BRANCH=$(git branch --show-current)

# Willie: what's waiting for me?
bd list --label willie --label "branch:$BRANCH" --status open

# Frink / Dr. Nick: what's waiting for me?
bd list --label frink  --label "branch:$BRANCH" --status open
bd list --label drnick --label "branch:$BRANCH" --status open

# Flanders: what's waiting for me?
bd list --label flanders --label "branch:$BRANCH" --status open

# Tod: what signals need triage?
bd list --label tod --label "branch:$BRANCH" --status open

# Bart: which sessions are finished and unharvested?
bd list --label bart --label "branch:$BRANCH" --status open

# Everything ready across the whole graph (the operator's loop):
for a in drnick willie tod flanders bart frink; do
  bd list --label "$a" --label "branch:$BRANCH" --status open --json \
    | jq -r --arg a "$a" '.[] | "\($a)\t\(.id)\t\(.title)"'
done

# All work on this branch:
bd list --label "branch:$BRANCH" --status open

# A specific planning session:
bd list -l willie-b7e3

# All design work on this branch:
bd list --label design --label "branch:$BRANCH" --status open

# All escalations from Flanders on this branch:
bd list --label from-flanders --label "branch:$BRANCH" --status open

# Backlog (not tied to any branch):
bd list --label backlog --status open
```
