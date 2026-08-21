---
name: pitch-doc
description: Writes ShapeUp pitches to docs/.pitches for work that spans a large surface area and has not been committed to yet. Use when Dr. Nick is shaping rather than designing — when the ask is a feature or a bet with an appetite rather than a ticket, when the output is meant for a betting table instead of for decomposition, or when the user says "write the pitch" or "shape this". Provides the pitch template and the mechanics of where pitches live and how they enter the graph. Do not use for ticket-sized design work (that is steering-doc), and note that the quality guidance for what makes a good pitch is deliberately unfinished — see below.
---

# pitch-doc

A pitch is for work that is **not yet committed to**. Its audience is a betting table deciding
whether to spend an appetite, not an implementer deciding what to build. That difference drives
everything else: a pitch that is too detailed is a *bad pitch*, the same way a steering doc that is
too vague is a bad steering doc.

## Where pitches live

```
docs/.pitches/<slug>.md      repo root, NOT inside a package
```

Repo root is deliberate. A pitch spans packages — often including packages that do not exist yet —
so filing it under one of them would be a claim about allocation that shaping is specifically not
supposed to make.

## Mechanics

1. **Appetite is set before the solution.** It's a constraint on the shape, not an estimate of it.
   Ask the user for it if they haven't said. Without an appetite you're writing a design doc with
   the word "pitch" on top.
2. **Shape at low resolution.** Fat-marker sketches. Enough to react to, not enough to foreclose.
3. **Name rabbit holes; do not solve them.** Naming one is the work. Solving it in the pitch is
   over-resolution, and over-resolved pitches are the classic shaping failure.
4. **Say where it lands in the tree.** Which packages, and whether new ones are needed. This is the
   knowledge-graph-specific addition to the standard ShapeUp shape, and it's cheap insurance: a
   reviewer who spots "this responsibility has nowhere to live" saves the whole appetite.
5. **Flag ADRs at risk.** If the pitch would contradict an accepted decision, list it in
   `adrs_at_risk` with its reversal cost. A pitch that quietly reverses a `reversal_cost: high` ADR
   is the most expensive kind of surprise the table can be handed.
6. **No claims table, no anchors, no ADRs.** Nothing is decided yet. Those artifacts appear after a
   bet is placed, when the work comes back as tickets.

## What happens after

| Outcome | Next |
|---|---|
| bet placed | the pitch becomes tickets; each ticket is a Dr. Nick or Willie session |
| not this cycle | leave the file, set `status: shelved` — a shelved pitch is a real asset |
| shape was wrong | revise and re-pitch; do not quietly turn it into a design doc |

Dr. Nick emits `SHAPED` and stops. Shaping and specifying are different jobs, and doing both in one
session is how a pitch ends up at the resolution of a design doc.

## ⚠ Pin: the quality guidance is unfinished

**What makes a pitch *good* is deliberately not written down here yet** — the user has parked it to
circle back once the rest of the knowledge graph is in place.

Today this skill gives you the mechanics: where the file goes, the shape of the template, what enters
and what leaves. What it does not give you is the craft — how much solution is the right amount, how
to tell a real rabbit hole from a nervous one, when a no-go is protecting the appetite versus hiding
a problem, and how to write the problem statement so the table argues about the right thing.

Until that lands: work from the template, keep the resolution low, and when in doubt ask the user
rather than inventing house style. Anything you invent now will have to be unlearned.

**When picking this up again**, the open questions are:
- How much of ShapeUp's original guidance applies here versus what this team does differently?
- What does "low resolution" mean concretely for a polyglot Go/Java service with an MCP surface?
- Does the package-allocation section belong in the pitch at all, or does it force resolution too
  early? (It's in the template on the argument that a missing package is cheap to spot and expensive
  to discover — that argument has not been tested.)
- What does the betting table actually look like for this team, and what does it need to decide?
