# ADR-NNNN: <Title>

> Use this template for a load-bearing decision that doesn't need a full design doc, or paste the inner block (Context → Considered → Chose → Why → Consequences) into a design doc's Decisions section.

**Status:** proposed | accepted | superseded | deprecated
**Date:** YYYY-MM-DD
**Deciders:** <names>
**Supersedes:** <ADR-NNNN, if any>
**Superseded by:** <ADR-NNNN, if any>

---

## Y-Statement

In the context of `<use case / situation>`, facing `<concern / problem>`, we decided for `<chosen option>` and against `<rejected alternatives>`, to achieve `<quality / outcome>`, accepting `<downside / cost>`.

> The Y-statement is the elevator pitch. If the rest of the ADR went missing, this single sentence should still convey what was decided and why.

---

## Context

What forces this decision? Two to four sentences. State the facts of the situation that make a choice necessary — the design constraint, the bug, the new requirement, the discovered limitation. Avoid rehashing project background; assume a reader who knows the project but doesn't know this specific corner.

## Considered Options

Three is a good number. One option means no real choice was made; five means analysis paralysis.

### Option A: <name>

**Sketch.** One to three sentences on what this option is.
**Pros.**
- <terse upside>
- <terse upside>
**Cons.**
- <terse downside>
- <terse downside>

### Option B: <name>

**Sketch.** ...
**Pros.**
- ...
**Cons.**
- ...

### Option C: <name>

**Sketch.** ...
**Pros.**
- ...
**Cons.**
- ...

## Decision

We chose **Option <X>**.

The decision criterion that mattered most: <one sentence — what tipped this over the others>.

## Consequences

What we accept by choosing this:

- **Positive.** <What gets easier, better, faster, simpler.>
- **Negative.** <What gets harder, worse, slower, more complex. Be honest. Every decision has costs; failing to name them invites surprise later.>
- **Neutral.** <Side effects that aren't clearly good or bad but readers should know about — e.g., "we now depend on library X being maintained".>

## Confirmation

How will we know this decision was correct in retrospect? Two to four bullets:

- <Observable signal that says "this is working as intended">
- <Observable signal that would say "we got this wrong">

## References

- <Link to design doc this decision lives within, if any>
- <Link to PR/issue that implements>
- <External references>
