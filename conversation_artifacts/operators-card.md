# Operator's Card

*The one page you keep open while the engine turns.*

## Four doors in

Only four states can be started cold. Everything else is warm-only — it needs an upstream bead, and wanting to open one cold is a diagnostic, not an option.

| Door | When | What you bring |
|---|---|---|
| **Frink** | a feature, change request, or bet request | the problem, constraints you already know, explicit non-goals, `DEPTH: shape\|build`, `APPETITE` if shaping |
| **Tod** | a bug, incident, or support signal | the symptom, how it was observed, any repro steps you have |
| **Willie** | a ticket that needs no design — mechanical, established pattern | the ticket |
| **Snyder** | review comments landed on an MR | the MR link |

## Five warm-only sessions

| Session | Opened when | You bring | The bead brings |
|---|---|---|---|
| **Martin** | Frink emitted `DESIGNED` | "proceed" | pointer to the ADR node |
| **Troy** | Frink emitted `SHAPED` | appetite, if it wasn't set upstream | Frink's shape trace |
| **Marge** | the bet was placed at the table | "proceed" | the pitch |
| **Flanders** | Willie emitted `PLANNED`, or Tod emitted `REPRODUCED`, or Snyder emitted `UPHELD-SIMPLE` | "proceed" | the bead, plus the repro guide on the bug path |
| **Chalmers** | every bead for a work item is closed | "proceed" | the closed bead set + the delta dirs |

**Diagnostics.** Wanting Martin cold means you skipped Frink and are about to specify something nobody designed. Wanting Marge cold means you're breaking down a pitch that never went to the table. Wanting Flanders cold isn't a graph move at all — that's freeform pairing, which is fine, but it produces no beads and no harvest, so don't expect the knowledge graph to know it happened.

---

## The session ritual — identical every time

1. **Open the agent the last emit named.**
2. It **Orients**: `drift refs` on the paths in scope, traverses the knowledge graph 2 hops, and states its entry points in one line. Eyeball that line — a wrong entry point is cheap to catch here and expensive later.
3. It **reads its inbox** — open, unblocked beads addressed to it on this branch:
   ```bash
   bd list --label <agent> --label "branch:$(git branch --show-current)" --status open
   ```
   If more than one is ready, it presents the queue and you pick.
4. **You say proceed**, or supply context if you came through a cold door.
5. It runs, stopping in-session as often as it likes. Those stops are free — you're already loaded.
6. It **emits exactly one exit and names the next agent to open.**

Step 6 is the whole design. **You never navigate the graph.** Sixteen agents exist, and the operating knowledge you hold is four doors plus "do what the emit says." If you ever have to work out where a piece of work goes next, a prompt's Exits block is under-specified.

---

## The queue is the unit of work, not the work item

You'll have several items in flight — a bug in Tod, two beads waiting on Flanders, a design waiting on Martin. Your actual loop is:

```bash
# what's ready, across every agent, on this branch
for a in frink martin troy marge willie tod flanders chalmers snyder; do
  bd list --label "$a" --label "branch:$(git branch --show-current)" --status open --json \
    | jq -r --arg a "$a" '.[] | "\($a)\t\(.id)\t\(.title)"'
done
```

Pick a row, open that agent, run the ritual. That's the engine turning.

Two things worth watching in that output:

- **A bead addressed to an agent you don't want to open** usually means the wrong exit was emitted upstream. Reopen the emitting session's bead and check the rationale before re-routing by hand.
- **Nothing ready anywhere, but work in flight** means something ended without an emit. That's a dead state machine — find the session that drifted to a stop.

---

## Session counts to expect

| Path | Sessions |
|---|---|
| Bug, straightforward | Tod → Flanders → Chalmers = **3** |
| MR feedback, simple | Snyder → Flanders → Chalmers = **3** |
| Feature, 3 beads | Frink → Martin → Willie → Flanders ×3 → Chalmers = **7** |
| Bet → shipped | Frink → Troy → *[table]* → Marge → Willie → Flanders ×N → Chalmers = **5 + N**, spread over the appetite |

If a feature routinely exceeds 7, recombine Frink and Martin before touching anything else — it's the cheapest boundary to give back.
