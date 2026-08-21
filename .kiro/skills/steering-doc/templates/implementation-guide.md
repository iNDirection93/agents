<!--
  EPHEMERAL. Not a system of record. Gitignored.

  Written by Dr. Nick when a design needs more scaffolding than an ADR to become beads.
  Willie reads it, turns it into beads, and DELETES it in the same session.

  If a fact in here deserves to outlive the ticket, it belongs in a steering doc or an ADR
  BEFORE this file dies. Nothing may cite this file.
-->

# Implementation Guide — <TICKET>

**Design source**: <pkg>/.design/adrs/<NNNN>-<slug>.md
**Steering affected**: <pkg>/.steering/<topic>.md
**Written**: <YYYY-MM-DD> — delete after decomposition

## What is being built

<Two or three sentences. The shape, not the steps.>

## Package allocation

| Change | Owning package | New package? | Notes |
|---|---|---|---|
| <the change> | <path> | no | <why it belongs there> |

## Order that matters

<Only the ordering constraints that are real. "Do A before B because B imports A's interface."
Willie decides the rest — do not pre-empt his decomposition.>

## Claims this must satisfy

| Claim | Where it will be verified |
|---|---|
| <PREFIX>-00N | <test, or live check> |

## Seams to preserve

<Boundaries that must survive implementation. This is the part most likely to be lost in
decomposition, which is why it is written down.>

## What I deliberately left open

<Decisions Willie or Flanders should make, and the constraints on them.>
