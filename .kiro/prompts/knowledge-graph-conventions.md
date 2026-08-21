# Knowledge Graph Conventions — Package Steering, Design Records, and Drift Binding

All agents that read or write project knowledge (Dr. Nick, Willie, Flanders, Bart, Tod, Lisa) follow
these conventions. This is the shared contract that keeps knowledge **next to the code it describes**
and **small enough to load when you step into a package**.

This document defines the graph. `bead-conventions.md` defines how work moves along it.

---

## Why this exists

The previous system put design knowledge in large, flat documents under `design/*.md`. Three failures
followed, and every rule below is a direct response to one of them:

| Failure | Rule that fixes it |
|---|---|
| Docs went stale silently — the code moved, the claim didn't | Drift binding + CI gate (§6) |
| Docs were divorced from the code they described | Knowledge lives *inside* the package (§1) |
| Agents loaded a 900-line doc to change one file | Lean steering + the nesting rule (§2, §3) |

A design doc that nobody can afford to load is the same as no design doc.

---

## 1 · Where knowledge lives

```
<package>/
  .steering/
    <topic>.md                    # what IS (or is about to be). Read on entry. Lean.
  .design/
    DESIGN_CHANGELOG.md           # what changed in this package's design, and why
    adrs/
      0001-<slug>.md              # context > problem > options > decision
    guides/
      <TICKET>-implementation-guide.md   # EPHEMERAL. gitignored. Willie consumes, then deletes.
```

Plus one repo-level location:

```
docs/.pitches/<slug>.md           # ShapeUp pitches — cross-package, pre-commitment
```

### The three stores, and what each is for

| Store | Answers | Tense | Lifetime | Who writes |
|---|---|---|---|---|
| `.steering/` | "What must I know to work here?" | present / imperative | as long as the package | Dr. Nick (prose), Bart (frontmatter only) |
| `.design/adrs/` | "Why is it this way?" | past, immutable | forever, superseded not deleted | Dr. Nick |
| `.design/DESIGN_CHANGELOG.md` | "When did the design move?" | past, append-only | as long as the package | Dr. Nick, Bart (append) |
| `.design/guides/` | "How do I turn this design into beads?" | imperative | one ticket | Dr. Nick writes, Willie deletes |

**Steering is not a changelog.** The changelog moved out of the steering file precisely so steering
could get shorter. Do not put "Updated 2026-03-01: renamed X" in a steering doc; that row belongs in
`DESIGN_CHANGELOG.md`.

**ADRs are immutable.** A decision that gets reversed does not get edited — a *new* ADR is written
with `status: accepted` and the old one becomes `status: superseded-by <id>`. The reasoning behind a
decision is evidence; deleting it destroys the ability to tell "we chose wrong" from "the world
changed".

---

## 2 · The nesting rule — when a directory earns its own `.steering/`

Packages nest. Knowledge nests with them. But one steering doc per class is worse than one per
service — you get fragmentation instead of context.

A directory earns its own `.steering/` when **all four** hold:

1. **Single sentence, no "and".** You can state what it owns in one sentence without joining two
   responsibilities with "and". *"Owns HTTP and stdio transport"* fails — unless the sentence is
   really *"owns transport"* (one responsibility, two implementations), which passes.
2. **At least one claim that is not true of its parent.** If every claim you'd write is inherited,
   the knowledge belongs upstairs.
3. **The context test.** Would this content be *noise* to someone working only in the parent? If the
   parent's reader needs it, it belongs in the parent's steering.
4. **Two or more collaborating files.** A single class is not a package. Document it with a doc
   comment on the symbol.

It must **not**:

- Restate parent claims (that's duplication that will drift).
- Exist only because the directory exists (a directory is not a responsibility).

**Both directions are failures.** A package with 400 lines of steering has not been split. A tree
where every third directory has a 30-line steering doc has been over-split. When in doubt, keep the
knowledge in the parent and write down what would have to become true for the child to earn its own.

### Naming is load-bearing

Package names are the **edges of the graph**. An agent decides whether to descend into a directory
based on its name before it reads anything inside. A misleading name is therefore not cosmetic — it
is a broken edge, and it sends every future reader down the wrong branch.

Any agent may flag a misleading name. Dr. Nick is expected to, loudly, as a first-class output of a
design session (`RENAME:` proposals with rationale). Renames are real work and get real beads.

---

## 3 · Steering documents

### Frontmatter

```yaml
---
package: gateway/mcpServer/internal/transport
owns: "HTTP and stdio transport for MCP JSON-RPC requests"
read_when:
  - "adding or changing a route"
  - "touching request auth headers"
  - "changing how errors are serialized to the client"
claims: [TRANS-001, TRANS-002, TRANS-003]
covers:
  - gateway/mcpServer/internal/transport/http.go#ServeHTTP
  - gateway/mcpServer/internal/transport/stdio.go
adrs: [0003, 0007]
status: current            # current | provisional | stale
last_harvest: 2026-08-21   # set by Bart
---
```

| Field | Required | Meaning |
|---|---|---|
| `package` | yes | path from repo root; must match the directory this file lives under |
| `owns` | yes | the one-sentence responsibility from the nesting rule |
| `read_when` | yes | trigger phrases; how an agent decides this doc is relevant to its task |
| `claims` | yes | claim IDs asserted in the body (empty list is legal for a brand-new package) |
| `covers` | yes | code this doc is bound to; **projected into `drift.lock`** — see §6 |
| `adrs` | no | ADR ids in this package that constrain this doc |
| `status` | yes | `current` \| `provisional` (design landed, code hasn't) \| `stale` (Bart flagged it) |
| `last_harvest` | no | date + bead of the last harvest that checked this doc |

### Body — six sections, in this order

```markdown
## What this package owns
<1–3 sentences. The responsibility, and the boundary of it.>

## Must know before you touch this
<Bulleted. The MUST-KNOW context. Non-obvious invariants, ordering constraints,
 the thing that will bite someone who reads only the code. If a bullet is
 obvious from reading the code, delete it.>

## Claims
| ID | Claim | Anchor | Status |
|----|-------|--------|--------|
| TRANS-001 | When a request arrives without an Authorization header, ServeHTTP responds 401 before routing | http.go#ServeHTTP | verified |

## Code anchors
<The symbols this doc is bound to, one per line, as inline drift refs:>
@./gateway/mcpServer/internal/transport/http.go#ServeHTTP

## Boundaries
<What this package must NOT do. Who is allowed to call it. What it may not import.>

## Where decisions live
- ADR 0003 — HTTP is the default transport; stdio is opt-in
- ADR 0007 — errors are serialized at the transport edge, not in handlers
```

### Hard limits

- **≤120 lines.** Past that, either the package needs splitting (§2) or the doc is narrating code.
- **No code block over 10 lines.** Point at the symbol. The code is the source of truth for *what*;
  steering is the source of truth for *why* and *must-know*.
- **No changelog section.** It lives in `.design/DESIGN_CHANGELOG.md`.
- **No "how it works" narration.** If a reader could learn it by opening the file you're pointing at,
  don't write it down — you've just created something that can go stale for no benefit.

### Claims

Claim IDs are `{PREFIX}-{NNN}` where the prefix is a short mnemonic for the *package*, unique in the
repo (`TRANS`, `AUTH`, `RECQ`). Claims are written in EARS form and are falsifiable:

- `When <trigger>, <component> shall <response>`
- `While <state>, <component> shall <response>`
- `If <unwanted condition>, then <component> shall <recovery>`
- `<Component> shall <response>` (unconditional invariant)

Status: `unverified | implemented | verified`. Flanders moves a claim to `verified` when a test or a
live run proves it; that status field is the one part of a steering doc Flanders may edit.

---

## 4 · ADRs

One decision per file, `NNNN-kebab-slug.md`, numbered per package starting at `0001`.

```yaml
---
id: 0003
title: "HTTP is the default transport; stdio is opt-in"
status: accepted            # proposed | accepted | superseded-by NNNN
date: 2026-08-21
context: "Two transports share one config surface; clients differ in what they support."
problem: "Which transport applies when the client doesn't specify one?"
decision: "HTTP is the default. stdio requires an explicit --stdio flag."
consequences_short: "stdio users must pass a flag; health checks may assume HTTP."
reversal_cost: high         # high | medium | low
affects_steering: [.steering/transport.md]
supersedes: []
---
```

Body: **Context → Problem → Options considered → Decision → Consequences**. Options are the load-
bearing part — an ADR that lists one option is a diary entry, not a decision record. Each option gets
what it would have cost and why it lost.

### Reading ADRs without drowning

The frontmatter exists so that an agent can read **every ADR head in a package** cheaply and open
only the bodies it needs. The rule:

> Read all frontmatter. Open the body when `reversal_cost: high`, **or** when the decision touches
> what you are about to change, **or** when you are about to contradict it.

Contradicting an accepted ADR without reading its body is the single worst move available in this
system. It is how a team re-learns a lesson it already paid for.

---

## 5 · Implementation guides (ephemeral)

`.design/guides/<TICKET>-implementation-guide.md` is written by Dr. Nick when a design needs more
scaffolding than an ADR to become beads. It is:

- **gitignored** — it is not a system of record, and it must never become one;
- **consumed by Willie** — he reads it, turns it into beads, and **deletes it in the same session**;
- **never cited** by a steering doc or an ADR. If a fact in the guide deserves to survive, it belongs
  in steering or in an ADR before the guide dies.

If Willie finds a guide older than the ticket he's planning, he deletes it and says so. A guide that
outlives its ticket is a decoy.

---

## 6 · Drift binding — how docs stay tied to code

[Drift](https://github.com/fiberplane/drift) binds a markdown doc to a file or an AST symbol and
fails CI when the code moves and the doc doesn't. It supports Java and Go (both of our languages),
plus TypeScript, Python, Rust, and Zig.

**Two representations, one source of truth:**

| Representation | Written by | Read by | Purpose |
|---|---|---|---|
| `covers:` frontmatter + `## Code anchors` | agents | agents, humans | legible; the thing you edit |
| `drift.lock` (TOML, repo root) | `drift link` | `drift check` in CI | enforced; signatures |

`covers:` is **projected** into `drift.lock` by `.kiro/skills/drift-anchors/link-steering.sh`, which
runs `drift link <doc> <target>` per entry. Never hand-edit `drift.lock`.

```bash
# after the symbols exist in code
.kiro/skills/drift-anchors/link-steering.sh <package>/.steering/transport.md

# what's stale
drift check
drift check --changed gateway/mcpServer     # scoped, for CI on a PR
drift refs gateway/mcpServer/internal/transport/http.go   # which docs cover this file?
```

### Anchor targets

`path/to/file.go` binds the whole file. `path/to/file.go#SymbolName` binds one declaration — prefer
symbol anchors, because a file anchor goes stale on every unrelated edit and teaches agents to
re-stamp without reading.

### Who may re-stamp

Re-stamping (`drift link`) declares *"I looked, and the doc is still true."* That is a judgement, so:

| Agent | May re-stamp? |
|---|---|
| Bart (harvest) | **Yes** — that is the job. Content still true → re-stamp; content invalidated → bead for Dr. Nick. |
| Dr. Nick | Yes, for docs he just rewrote. |
| Flanders | **No.** He records `drift check` output in the bead close reason and moves on. |
| Willie, Lisa, Tod, todbots | No. |

CI stays red between "code landed" and "harvest ran". That is deliberate — it is the mechanism that
makes the harvest non-optional.

### Symbols that don't exist yet

Greenfield steering is written before the code. Put the intended symbol in `covers:` anyway, mark the
doc `status: provisional`, and **do not** run `link-steering.sh` until the symbol exists (`drift link`
would fail on a missing file). Flanders creates the symbol; Bart links it at harvest.

---

## 7 · How an agent enters a package

This is the traversal protocol. It is the same for every agent.

1. **Descend by name.** Start at the repo root and walk toward the code in scope, using directory
   names as the signal. If a name doesn't tell you whether to descend, that's a finding — report it.
2. **Read frontmatter on the way down.** For each `.steering/` you pass, read the frontmatter
   (`owns`, `read_when`, `claims`) — not the bodies. This is cheap and tells you if you're on the
   right branch.
3. **Read the destination package's steering in full.** All files in its `.steering/`. This is what
   the ≤120-line limit buys you.
4. **Read ancestor steering bodies only when `read_when` matches your task.**
5. **Read ADR frontmatter for the destination package.** Open bodies per the rule in §4.
6. **State your entry points in one line** before you start work: which packages, which claims,
   which ADRs. A wrong entry point is cheap to catch here and expensive later.

Depth guidance: two hops of ancestry is usually enough. If you need four, the package is probably in
the wrong place in the tree — say so.

---

## 8 · Ownership matrix

| Path | Dr. Nick | Bart | Willie | Flanders | Tod / todbots | Lisa |
|---|---|---|---|---|---|---|
| `<pkg>/.steering/*.md` body | write | **no** | read | read (+ claim status only) | read | read |
| `<pkg>/.steering/*.md` frontmatter | write | **write** | read | read | read | read |
| `<pkg>/.design/adrs/*` | write | read | read | read | read | read |
| `<pkg>/.design/DESIGN_CHANGELOG.md` | append | append | read | read | read | read |
| `<pkg>/.design/guides/*` | write | read | **delete** | read | — | read |
| `docs/.pitches/*` | write | read | read | read | — | read |
| `drift.lock` | via script | via script | no | no | no | no |
| `design/*.md` (legacy, Frink's) | **no** | read | read | read | read | read |

The legacy `design/*.md` tree still belongs to Frink. Dr. Nick does not edit it, and does not migrate
it wholesale — packages get steering docs as they get worked on, not in a big-bang conversion.

---

## 9 · Migration posture

Nobody converts the repo in one pass. The rule is **touch-to-migrate**:

- A package being designed gets `.steering/` + `.design/` created by Dr. Nick as part of that session.
- A package being harvested with no `.steering/` gets a `STEERING-MISSING` bead from Bart, not an
  improvised doc.
- Legacy `design/*.md` content is copied into a package's steering **only** when someone is doing
  design work in that package and can vouch for the content being current. Stale content copied
  forward is worse than a missing doc, because it looks maintained.

---

## 10 · Quick reference

```bash
# Which steering covers the file I'm about to edit?
drift refs path/to/file.go

# What does this package promise?
sed -n '/^---$/,/^---$/p' <pkg>/.steering/*.md          # frontmatter only

# What decisions constrain this package?
head -n 20 <pkg>/.design/adrs/*.md                       # ADR heads only

# Is anything stale after my change?
drift check --changed <pkg>

# Re-bind a doc after the symbols moved (Bart / Dr. Nick only)
.kiro/skills/drift-anchors/link-steering.sh <pkg>/.steering/<topic>.md
```
