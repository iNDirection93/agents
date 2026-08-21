# Node & Edge Specification

*v2 — modes removed. One agent, one task.*

## Two corrections to the earlier drawing

**1. A call is not a transfer.**

| | **Delegation** | **Handoff** |
|---|---|---|
| Shape | a **call** — it returns | a **transfer** — it does not return |
| Who moves | control, temporarily | the work item, permanently |
| Transport | Kiro sub-agent spawn | a bead, carried by the human |
| Cost | free | a session boundary |
| Chooser | the parent, mid-procedure | the exiting agent, at the end |

Only handoffs advance the state machine. Drawing `Frink → Comic Book Guy` beside `Frink → Martin` implied they were the same move.

**2. A node is a system prompt — and only ever one node.**

Frame → Explore → Decide are not three nodes; nobody chooses between them. They're the sequence inside Frink's prompt. Making procedure into nodes implies edges where there's only method.

The earlier `(agent, mode)` refinement was wrong. **The `model` field is per-agent-config, so an agent hosting two states must run one model for two task profiles** — Willie planning is long-context synthesis (Opus) while Willie auditing is bounded verification (Sol). The config schema forecloses the tuning, so the split isn't optional. Tool scoping fails the same way: an agent that both diagnoses and fixes needs the union of both tool sets, which means diagnosis runs with write and commit rights it should never have.

---

## The principle, stated precisely

> **One agent, one task.**

Two things this does *not* forbid:

- **Many callers.** Lisa is spawned by Frink, Willie, Tod and Chalmers. Her task is identical every time — answer a scoped read-only question with cited findings. Same prompt, model, tools, output contract. One task, many callers is a library function, not a smell.
- **Fan-in.** Frink is the target of `TRACE-INCOHERENT`, `DESIGN-SMELL` and `DESIGN-DEFECT`. That's one state with several entry conditions, not one config in several positions.

The smell is specifically **one config occupying two positions**, because that is what forces shared model and shared tools across different work.

---

## The roster

### State agents — 6. These have exits.

| State | Agent | Model | Tools | Why this model |
|---|---|---|---|---|
| design | **Frink** | Opus 5 | read, write `design/nodes/dec-*` | long: dialogue + 4–8 oracle returns + Lisa returns |
| specify | **Martin** | Sol | read, write `design/` | small by construction: ADR + trace only |
| plan | **Willie** | Opus 5 | read, `bd` write | long: stigmergic scan + parallel Lisa returns + ≤500-line plan |
| build | **Flanders** | Sonnet 5, escalating | read, write, shell, NedOps, git | mostly well-defined; debug loop escalates |
| intake | **Tod** | Sol | **read-only** + logs | diagnosis under uncertainty over a focused evidence set |
| integrate | **Chalmers** | Sol | read, `drift`, spawn Smithers | bounded verification: closed beads, claims table, diff, deltas |

### Delegation agents — 5. These have returns, not exits.

| Sub-agent | Called by | Model |
|---|---|---|
| **Comic Book Guy** | Frink (×1–4 parallel) | Sol |
| **Lisa** | Frink, Willie, Tod, Chalmers | Sonnet 5 |
| **Rod** | Flanders | Sonnet 5 |
| **Grimes** | Flanders (≤2 iterations) | Sol |
| **Smithers** | Chalmers (branch write, PR gate) | Sonnet 5 |

**Snake** is neither — a scheduled producer dropping findings into the inbox, same category as CI stale-node findings.

A sub-agent never chooses the next state. Grimes returning `NEEDS_CHANGES` is not an edge to Rod: control goes Grimes → Flanders → Rod. **Sub-agents define a return vocabulary; the parent maps returns to internal steps or exits.**

---

## What changed, and what it cost

**Willie split into Willie + Chalmers — free.** These were already two sessions in the accounting (plan at #3, integrate at #7). Splitting the config changes which agent the human opens, not how many times. **Chalmers** because his entire function in the show is arriving to verify that Skinner's claims about the school match reality — which is claim auditing.

**Tod promoted from sub-agent to state agent, and Flanders keeps only build.** Costs one session boundary on the incident path (3 sessions instead of 2, since `FIX-NOW` is now a real handoff). Buys **read-only diagnosis**: Tod's discipline is "don't fix what you haven't reproduced," and that's better enforced by withholding write access than by asking nicely in prose.

**The lane-splitting orchestrator dissolves.** Under the state-machine view the bug-vs-feature split isn't a judgment any agent makes — it's determined by what arrives. A signal goes to Tod; a bead goes to Flanders. Routing on trigger type needs no node. Flanders still fathers Rod; he just isn't a dispatcher any more.

**Session count: unchanged at 7 for a 3-bead feature.** Incident path is 3.

---

## Where the instructions live

| Store | Holds | Invariant across |
|---|---|---|
| **System prompt** | who I am, my procedure, my tools, my exits and their conditions | all work items |
| **Bead** | what this work is, its DoD, its seed nodes, its exit *targets* | all sessions within one work item |
| **Knowledge graph** | what's true about the system | work items; changes as the system changes |

> **The prompt declares the exit set — *when* each exit fires.**
> **The bead binds the targets — *where* each exit goes.**

The prompt is the switch statement; the bead supplies the jump addresses. Flanders' prompt says *"on Grimes `NEEDS_CHANGES` with iter ≤ 2, re-spawn Rod; on iter 3, emit `BEAD-WRONG`"* — always true. The bead says *"on PASS → bd-YYYY"* — true only here.

**Diagnostic:** if a bead needs to change *when* an exit fires, that's a prompt bug. Beads carrying conditional logic are the early warning that a prompt is under-specified.

### Why the ratio inverts between layers

- **State agents are entered with a work item.** Procedure fully known in advance, subject is one line. → heavy prompt, light bead. Frink's prompt is enormous; his trigger bead is a title and a paragraph.
- **Sub-agents are called with a task.** Narrow procedure, subject entirely per-invocation. → light procedure, heavy invocation. Rod's whole discipline is "implement exactly what the bead says" — content-free without the bead.

| Agent | Layer | Prompt carries | Invocation carries |
|---|---|---|---|
| Frink | state | five moves, oracle protocol, brownfield rules, **exits** | subject + area |
| Martin | state | doc template, claims format, propagation, **exits** | pointer to the ADR |
| Willie | state | six phases, smell table, bead conventions, **exits** | ticket or DECOMPOSE bead |
| Tod | state | reproduce→diagnose method, **exits** | the signal |
| Flanders | state | NedOps, commit discipline, return mappings, **exits** | the bead |
| Chalmers | state | audit procedure, claim taxonomy, **exits** | the closed bead set |
| Comic Book Guy | sub | corpus protocol, misuse-flag discipline, **output contract** | clause + anchor + gap |
| Lisa | sub | read-only allowlist, citation discipline, **output contract** | the question |
| Rod | sub | no-scope-creep discipline, **output contract** | the whole task |
| Grimes | sub | independence rules, **verdict vocabulary** | diff + DoD + contract |
| Smithers | sub | merge/anchor/integrity procedure | the delta dir |

The output contract is bold in every row: it's the interface, and it's the one thing every prompt must nail.

---

## The Exits block — every state agent gets this

Standard section, right after Orient:

```markdown
## Exits

This node has exactly N exits. You take one. You never end without one.

| Emit | Condition | Next node | Cost |
|---|---|---|---|
| `DESIGNED` | coverage declared, ADR node written | Martin | session boundary |
| `NOT-A-DESIGN-PROBLEM` | no boundaries drawn, no irreversible choice | Willie | session boundary |

**Exit discipline**
- The emit string goes in the bead title and the `exit:` label.
- The human's next action is determined entirely by which you emit —
  emitting the wrong one sends them to the wrong agent.
- Drifting to a stop without an emit is a failure. If none fit, emit the
  closest and say why in the bead body.
```

**An unenumerated stop is a dead state machine.** Willie already has this instinct — "a design without a DECOMPOSE bead is a blueprint gathering dust." Generalize it.

### The Returns block — every sub-agent gets this

```markdown
## Returns

You return to your parent. You do not choose the next node and you do not
know what it is.

| Verdict | Meaning | What the parent will do |
|---|---|---|
| `PASS` | DoD predicate satisfied | (not your concern) |
| `NEEDS_CHANGES` | + the specific unmet clauses | (not your concern) |
```

"Not your concern" is deliberate. A sub-agent that reasons about downstream consequences starts optimizing for them — which is how a reviewer becomes a negotiator.

### The Return mapping — every parent gets this

```markdown
## Return mapping — Grimes

| Grimes returns | iter | I do |
|---|---|---|
| `PASS` | any | commit, close bead, emit `BEAD-DONE` |
| `NEEDS_CHANGES` | 1–2 | re-spawn Rod with the unmet clauses |
| `NEEDS_CHANGES` | 3 | stop. emit `BEAD-WRONG` to Willie |
| `blocked` / `failed` | any | surface to human, do not guess |
```

This table is the actual state-machine wiring — the part that was implicit before.

---

## The two diagrams, kept separate

**State machine** (`agent-state-machine-v2.mermaid`) — 6 states, 6 agents, 16 edges, every edge a bead the human carries. It should look *small*. Past ~8 states you've started making procedure into nodes again.

**Delegation trees** — not a graph. A call tree per state, deliberately in a different visual language:

```
Frink                        Willie                    Flanders
├── Comic Book Guy ×1–4      └── Lisa ×N               ├── Rod
└── Lisa                         (enumerated upfront)   └── Grimes  (≤2 iters)

Martin                       Tod                       Chalmers
└── Lisa (path:line only)    └── Lisa                  ├── Lisa
                                                       └── Smithers (branch, PR gate)
```

Read the first as "where the work goes next," the second as "who this agent calls." They should never share an arrowhead again.

---

## Consequences for the existing prompts

**Every current prompt is missing exits.** Frink has Step 4 ("ring the bell") — one exit stated as a procedure step — and no `NOT-A-DESIGN-PROBLEM` exit at all, so a session that discovers the work is mechanical has nowhere to go. Martin needs `TRACE-INCOHERENT` as an honesty valve. Flanders needs `DESIGN-DEFECT`. **Adding the missing exits is the highest-value prompt change in the migration** — it's what turns a set of agents into a state machine.

**Willie's prompt sheds Phase 0 REVIEW handling and Phase 6 trust signals** — those move to Chalmers, who now owns everything verificatory. Willie keeps Phases 0.5–4: scan, intake, investigate, smell-check, plan, gate, create.

**Flanders' prompt sheds Freeform Mode from the machine.** Freeform is a deliberate escape hatch — pairing with an agent outside the graph. Name it as outside rather than pretending it's a state; it has no exits and produces no beads, and that's fine as long as it's explicit.

**`SUCCESSOR EDGES` in the bead payload was doing two jobs.** Split it:

```
EXIT TARGETS:              # bead — where only
  PASS       → bd-YYYY
  BEAD-WRONG → willie
```

Conditions (`iter ≤ 2`, `3rd failure`) move into Flanders' Return mapping, where they belong.
