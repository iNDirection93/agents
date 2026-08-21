---
id: <NNNN>
title: "<the decision, stated as a decision — not a topic>"
status: proposed
date: <YYYY-MM-DD>
context: "<one sentence: the situation that forced a choice>"
problem: "<one sentence, phrased as a question>"
decision: "<one sentence: what we chose>"
consequences_short: "<one sentence: what this makes easier and what it makes harder>"
reversal_cost: medium
affects_steering: [.steering/<topic>.md]
supersedes: []
---

# <NNNN> — <title>

## Context

<What is true about the world that made this a decision rather than an obvious move? Forces,
constraints, deadlines, existing commitments. No solution language.>

## Problem

<The question, stated so that someone who disagrees with the answer would still agree with the
question.>

## Options considered

### Option A — <name>
<What it is. What it would cost. What it would buy.>
**Rejected because**: <the specific reason, not "it was worse">

### Option B — <name>
<...>
**Chosen.**

### Option C — <name>
<...>
**Rejected because**: <...>

<An ADR with one option is a diary entry, not a decision record. If there really was only one
option, the interesting content is why the obvious alternatives were not viable — write that.>

## Decision

<What we chose, stated in the imperative. Include the boundary of the decision: what it does NOT
decide.>

## Consequences

**Easier**: <...>
**Harder**: <...>
**Now load-bearing**: <what other code now depends on this being true>

## Revisit when

<The condition that should make someone reopen this — a scale threshold, a dependency version, a
product direction. "Never" is a legitimate answer; write it.>
