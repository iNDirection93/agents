# Bead Conventions — Shared Tagging & Dependency Standard

All agents (Willie, Frink, Flanders) follow these conventions when creating, updating, or closing beads. This is the shared contract that keeps work organized and discoverable.

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
| `frink` | Created by Frink (design work) |
| `flanders` | Created by Flanders (discovered during implementation) |

### 2. Routing Labels (WHO should pick it up)

When a bead is created FOR another agent, add a routing label:

| Label | Meaning |
|-------|---------|
| `from-willie` | Willie created this for someone else to execute |
| `from-frink` | Frink created this (usually a DECOMPOSE bead for Willie) |
| `from-flanders` | Flanders created this (escalation to Willie or Frink) |

**Self-addressed beads are valid.** An agent can create a bead for itself (e.g., Willie parking a note for future-Willie). In that case, both the origin and the recipient are the same:
```bash
# Willie creates a bead for future-Willie
bd create "Revisit pagination approach after Frink's design" \
  -l "willie,from-willie,willie,branch:$(git branch --show-current),pr-plan"
```

Routing labels tell the RECIPIENT to check for incoming work. The pattern is simple — one query per agent:

```bash
BRANCH=$(git branch --show-current)

# Willie checks for all work assigned to him on this branch:
bd list --label willie --label "branch:$BRANCH" --status open

# Frink checks for all work assigned to him on this branch:
bd list --label frink --label "branch:$BRANCH" --status open

# Flanders checks for all work assigned to him on this branch:
bd list --label flanders --label "branch:$BRANCH" --status open
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

### 5. Risk/Complexity Labels (optional)

| Label | Meaning |
|-------|---------|
| `risky` | Might bite you — review carefully |
| `straightforward` | Simple, well-understood change |

### 6. Session Tags

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
flanders, from-flanders, willie, branch:<name>, <area>        # Implementation work needing planning
flanders, from-flanders, frink, branch:<name>, design, <area>  # Design question needing thinking
```
For self-addressed beads:
```
flanders, from-flanders, flanders, branch:<name>, <area>
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
                            (from-flanders)
                                │
                         ┌──────┴──────┐
                         ▼             ▼
                   willie bead    frink bead
                   (needs plan)  (needs design)
```

---

## Quick Reference: Finding Work

```bash
BRANCH=$(git branch --show-current)

# Willie: what's waiting for me?
bd list --label willie --label "branch:$BRANCH" --status open

# Frink: what's waiting for me?
bd list --label frink --label "branch:$BRANCH" --status open

# Flanders: what's waiting for me?
bd list --label flanders --label "branch:$BRANCH" --status open

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
