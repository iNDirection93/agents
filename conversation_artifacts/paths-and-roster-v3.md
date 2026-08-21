# Paths, Roster v3

## 1 · Three kinds of design work

The clean resolution: **Frink is the thinker for all of them; the renderer differs by destination.**

| Destination | Renderer | Resolution | Output |
|---|---|---|---|
| build now | **Martin** | high — interfaces, schemas, errors, claims | `design/<name>.md` + claim nodes |
| betting table | **Troy** | low — shaped, not specced | pitch: appetite, solution sketch, rabbit holes, no-gos |

This mirrors the split you already accepted. Frink generates architecture; someone else renders it at the resolution the audience needs. A pitch that's too detailed is a *bad pitch*, the same way a design doc that's too vague is a bad design.

**Frink gains a `SHAPED` exit** alongside `DESIGNED`. His procedure is unchanged — Moves 1–3 — but a bead field caps how deep he goes:

```
DEPTH: shape        # stop when rabbit holes are named and appetite is spent
DEPTH: build        # stop when coverage is declared
APPETITE: 6 weeks   # shape only
```

**Is that a mode by the back door?** No, and the criterion we established says why. Modes were disqualified because they force a shared model and shared tools across *different profiles*. Frink shaping and Frink designing have the same context profile (long, dialogue-heavy, oracle fan-out), the same tools, the same model. Nothing is forced into a compromise. The stopping condition is payload, and payload belongs in the bead.

One real difference: **at `DEPTH: shape`, cap Comic Book Guy fan-out at 2.** Firing eight oracle calls to shape a pitch is over-resolution, and over-resolved pitches are the classic shaping failure.

**Troy McClure** — the pitch guy, and his register is exactly "here's what this is, at a level you can decide on." Rabbit holes are the thing he must name and *not* solve.

### Work breakdown: pitch → tickets

Your Willie prompt already has Ticket Mode. Under one-agent-one-task it has to leave, because it fails both mechanical tests against Willie's planning job:

| | **Marge** (pitch → tickets) | **Willie** (design/ticket → beads) |
|---|---|---|
| Input | a shaped pitch — deliberately fuzzy | a specified design or a ticket |
| Output | `design/.tickets/NNN-*.md`, 1–3 days each | atomic beads with `path:line` |
| Audience | a future Willie | Flanders |
| Investigation | none — the pitch is the input | Lisa fan-out, code reading |
| Context | small | long |
| Model | **Sol** | **Opus 5** |

**Marge** — the one who breaks an overwhelming thing into a list nobody drops.

---

## 2 · The bug path

### Correction: Tod must write

Last turn I argued Tod should be read-only, and your step 1 makes that wrong — he has to *add* the ability to trigger the bug and *add* observability when the logs don't show enough. Withholding write access would block the workflow.

The scoped version keeps the discipline:

> **Tod may write observability, test harnesses, and local runners. He may not change production behaviour.**

And there's a systemic reason this is safe rather than a compromise: **Tod can instrument liberally precisely because Kent audits it before merge.** The cleanup is built into the path, so over-instrumenting early costs nothing. That's better than a read-only Tod who can't see what's happening.

### Your six steps, mapped

| Your step | Node | Layer | Why |
|---|---|---|---|
| 1 · reproduce live, add runnability + observability | **Tod** | **state** | branches on NO-REPRO; produces a durable artifact the next state consumes |
| 2 · express as a failing automated test | **Edna** | sub of Flanders | output is machine-checkable — the test either fails for the right reason or it doesn't |
| 3 · red → green → refactor | **Rod** | sub of Flanders | same worktree, same running services as step 2 |
| 4 · re-run the reproduction guide | **Flanders** himself | — | this is his live-test superpower; no delegation needed |
| 5 · observability review, log levels, production quality | **Kent** | sub of Chalmers | fresh context — the instrumentation was written two sessions ago |
| — | **Grimes** | sub of Flanders | reviews the *fix*, unchanged |
| 6 · exit to MR | **Chalmers** | state | harvest + PR, unchanged |

**Three states, not six.** Steps 2–4 share one Flanders session because they operate on the same worktree with the same services running, and red-green-refactor is inherently one tight loop. Splitting them would buy nothing and cost two session boundaries.

Step 5 goes to Chalmers rather than Flanders deliberately: reviewing instrumentation you added in the same session is the same self-review problem Grimes exists to avoid.

### The artifact between Tod and Flanders

The reproduction guide is durable, not a bead field:

```
.kiro/repro/bd-XXXX.md
  - preconditions and how to get the system into them
  - the trigger, exactly
  - what you should see (the bug), with the log lines that prove it
  - path:line where it originates, evidenced by the observability added
  - what was instrumented, and where            → Kent's input at step 5
```

Same reasoning as doc deltas: anything the next session needs must survive a cache restart.

### New exit

**`REPRO-INSUFFICIENT` — Flanders → Tod.** When Edna can't express the repro as a test, the failure is usually upstream: the guide is ambiguous about timing, state, or environment. Sending it back beats guessing at a test.

### Names

**Edna Krabappel** administers the test. **Kent Brockman** decides what's front-page (ERROR), what's a segment (WARN/INFO), and what belongs in the archive (DEBUG) — and his characteristic failure mode is sensationalism, which is exactly log spam.

---

## 3 · The MR feedback loop

**The PR node stops being terminal.** It has two out-edges: approved → merged, or review comments → back into the machine.

The load-bearing design point: **not every review comment should be implemented.** Some are wrong, some are out of scope, some are preference. An agent that implements all of them uncritically is worse than no agent — it launders reviewer opinion into code.

So the node is an **adjudication**, not a compliance step. **Judge Snyder** rules on each comment: upheld or overruled, with the contested ones going to the human.

| Exit | Condition | Next |
|---|---|---|
| `UPHELD-SIMPLE` | 1–2 upheld comments, no restructure | Flanders |
| `UPHELD-COMPLEX` | restructure, or crosses a contract | Willie |
| `ALL-OVERRULED` | every comment overruled — post rationale, re-request review | MR |
| `DESIGN-DEFECT` | a reviewer found a real architecture problem | Frink |

Snyder spawns **Lisa** to check whether a factual claim in a comment is actually true before upholding it. He writes the rationale for overruled comments; the human posts it (or approves the post) — that's the gate, and it's where the social judgment lives.

`UPHELD-SIMPLE` vs `UPHELD-COMPLEX` is the same Shape decision Willie makes, applied to feedback.

---

## 4 · Roster

### States — 9

| State | Agent | Model | Tools |
|---|---|---|---|
| design / shape | **Frink** | Opus 5 | read, write `design/nodes/dec-*` |
| specify | **Martin** | Sol | read, write `design/` |
| pitch | **Troy** | Sol | read, write `design/.bets/` |
| work breakdown | **Marge** | Sol | read, write `design/.tickets/` |
| plan | **Willie** | Opus 5 | read, `bd` write |
| reproduce / instrument | **Tod** | Sol | read, **scoped write**, shell, NedOps |
| build / fix | **Flanders** | Sonnet 5, escalating | read, write, shell, NedOps, git |
| integrate / audit / harvest | **Chalmers** | Sol | read, `drift`, spawn Smithers |
| adjudicate MR feedback | **Snyder** | Sol | read, MR API |

### Sub-agents — 7

| Sub-agent | Parent | Model |
|---|---|---|
| **Comic Book Guy** | Frink (×1–4, ×1–2 when shaping) | Sol |
| **Lisa** | Frink, Willie, Tod, Chalmers, Snyder | Sonnet 5 |
| **Rod** | Flanders | Sonnet 5 |
| **Edna** | Flanders | Sonnet 5 |
| **Grimes** | Flanders (≤2 iterations) | Sol |
| **Kent** | Chalmers | Sol |
| **Smithers** | Chalmers (branch write, PR gate) | Sonnet 5 |

**Snake** remains a producer into the inbox, not a node.

### Two observations on the allocation

**The architecture is overwhelmingly Sol-shaped.** Only Frink and Willie need Opus outright, plus Flanders on escalation. Everything else is complex judgment over a deliberately narrow evidence set — which is what happens when you enforce one task per agent and pass artifacts by reference. **The one-task rule is what made the cheap models viable.**

**Lisa is the only agent with five callers**, and that's fine — identical task every time, so it's a library function, not a config in five positions.

---

## 5 · Path lengths and roster cost

My earlier "past 8 states you're making procedure into nodes" heuristic was wrong — it counted the whole machine when it should count a path.

| Path | States | Sessions |
|---|---|---|
| Feature → build | Frink → Martin → Willie → Flanders ×N → Chalmers | 4 + N |
| Bet → pitch | Frink → Troy → *[betting table]* → Marge → Willie → Flanders ×N → Chalmers | 5 + N, spread over a cycle |
| Bug | Tod → Flanders → Chalmers | 3 |
| MR feedback | Snyder → Flanders → Chalmers | 3 |

No single path exceeds 5 fixed states. That's the number to watch.

**The cost is real: 16 configs, up from ~8 today.** Two consequences:

**Phase 1 gets more valuable, not less.** Sixteen prompts each carrying their own copy of the Go/Java boundary is untenable. Extract the constraint nodes *before* the roster grows, or you're writing the architecture out sixteen times.

**Don't build them all at once.** Order by whether the path is one you run this month:

1. **Build path first** — Frink, Martin, Willie, Flanders, Rod, Chalmers, Smithers, plus the existing CBG and Lisa. Prove the spine.
2. **Bug path second** — Tod, Edna, Kent, Grimes. This is where the crispest workflow is, so it validates fast.
3. **MR feedback third** — Snyder. Cheap to add, immediately useful.
4. **Bet path last** — Troy, Marge. Only needed when you actually run a betting cycle, and it's the path with the most organizational dependency outside the graph.
