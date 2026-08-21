---
title: "<the thing, named the way you'd say it out loud>"
appetite: <2 weeks | 6 weeks>
status: draft            # draft | pitched | bet | shelved
date: <YYYY-MM-DD>
packages_touched:
  - <path/from/repo/root>
adrs_at_risk: []         # ADRs this pitch would contradict, by <pkg>:<id>
---

# <Title>

## Problem

<The raw need. A specific story about someone hitting the limitation — not a feature request, and
not a solution with the word "problem" in front of it. If you cannot tell the story of one person
hitting this, you do not have a problem yet.>

## Appetite

<How much time this is worth — not how long it will take. This is a constraint on the solution, not
an estimate of it.>

## Solution

<The shape, at low resolution. Enough that people can react to it, not so much that it forecloses
the implementer's decisions. Fat-marker sketches; embedded diagrams over prose where a picture is
faster.>

### Where it lands in the tree

<Which packages this touches, and — the part that matters here — whether it needs packages that do
not exist yet. Naming a new package in the pitch is how a reviewer catches "this responsibility has
nowhere to live" before anyone has spent the appetite.>

## Rabbit holes

<Named, not solved. The places where someone could disappear for a week. Each one gets a sentence
saying what we are NOT doing about it.>

## No-gos

<Explicitly out of scope. This is what protects the appetite.>

## Open questions for the table

<What the betting table has to decide that this document cannot.>
