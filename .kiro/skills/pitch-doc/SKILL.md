---
name: pitch-doc
description: Writes ShapeUp pitches in this team's house format for work that spans a large surface area and has not been committed to yet. Use when the ask is a bet with an appetite rather than a ticket, when the output is for a betting table rather than for decomposition, or when the user says "write the pitch", "shape this", or "put this up for the cycle". Provides the section-by-section template and the craft guidance derived from the team's existing pitches — how to name the trap in the framing, how to justify an appetite, what belongs in "What we know going in", and what makes a rabbit hole real. Do not use for ticket-sized design work (that is steering-doc) or for writing a design doc.
---

# pitch-doc

A pitch is for work **not yet committed to**. Its audience is a betting table deciding whether to
spend an appetite, not an implementer deciding what to build.

That difference drives everything: a pitch that is too detailed is a *bad pitch*, the same way a
steering doc that is too vague is a bad steering doc. But "low resolution" does not mean vague —
this team's pitches are extremely specific about **what is known** and deliberately open about
**what will be decided during the build**. Getting that line right is the craft.

## Where pitches live

```
docs/.pitches/<slug>.md
```

Repo root, not inside a package: a pitch spans packages — often including ones that do not exist yet
— so filing it under one would be an allocation claim that shaping is not supposed to make.

> Existing pitches live at `design/<feature-slug>/bets/<name>.md`. Leave them there. New pitches go
> to `docs/.pitches/`, same as `.steering` migration: touch-to-migrate, no big-bang move.

Filename and title carry the cycle: `YYYY Cycle N Pitch NN: <Name>`. **NN is a placeholder** until
the betting table assigns it — say so in the header blockquote rather than guessing a number.

No YAML frontmatter. Pitches use the header block in the template (Team / Author / Date / Status /
Feature Set) and are not part of the drift or steering machinery — nothing binds them to code,
because nothing has been built yet.

---

## The seven sections, and what each is for

| § | Section | Its job | The failure |
|---|---|---|---|
| 1 | 🔍 Problem | relocate the cost — show where the work actually is | a feature request with "problem" written on top |
| 2 | ⏳ Appetite | constrain the solution | estimating instead of constraining |
| 3 | 💡 Solution | give the table something to argue with | designing it to completion |
| 4 | ❓ Open Questions | name what could still change the bet | a dumping ground for minor uncertainty |
| 5 | 🕳️ Rabbit Holes | name temptations without solving them | listing generic risks |
| 6 | 🚫 No-gos | rule things out absolutely | restating table stakes |
| 7 | 📋 Follow-up | park deferred work so it isn't lost | a wish list |

Open Questions is the only optional one. If everything load-bearing is known, delete it and
renumber — a section full of small uncertainty devalues the ones that matter.

---

## §1 Problem — the move that matters most

**Name the trap in the framing.** This is the single strongest recurring move in this team's pitches
and it is what separates a pitch from a ticket:

> "The trap is the framing. 'Support the new spec = bump the SDK' reads as a one-line dependency
> bump. It isn't, because the gateway is a proxy with two boundaries and the SDK only lives on one
> of them."

> "So 'accept alongside API keys' is *not* an additive change: the two-way classifier has no slot for
> a third type, and the new type collides with the first on the only signal the gateway uses. The
> load-bearing work is credential classification, which the original scoping did not mention at all."

The naive statement of a piece of work usually puts the cost in the wrong place. Finding where it
actually sits is most of the value a pitch adds — a table can decide about *the real work*, and
cannot decide about a framing that hides it.

If the framing is honest and the work is where it looks, say that plainly. But check first.

**Then say why it's contained.** Having relocated the cost, show what is already built, already
paid for, already reusable. This is what turns "sounds enormous" into a bet somebody takes:

> "The good news — why this is a contained bet. The expensive-looking half is already built."

> "The scary part — turning the gateway stateless — is already done."

**Lead with the incident when there is one.** A thing that already went wrong beats a thing that
might. The migration pitch opens with a real multi-tenant outage and never has to argue for urgency
again.

**Enabling conditions.** Why now and not last cycle — a dependency that landed, a spec that got
published, a precondition already paid. If you cannot name one, ask why this is being pitched this
cycle.

**Requirements as checkboxes.** Falsifiable, one per promise. This is the list the table is agreeing
to. Mark genuinely optional ones as optional.

## §2 Appetite — a constraint, not an estimate

State the number, then **justify the shape**, not the arithmetic. Three things earn their place:

1. **A work table with sizes.** Not a schedule — a demonstration that the pieces are known.
2. **The load-bearing cost, named.** On most of these bets it is *verification, not construction*:
   > "Verification is the load-bearing cost, not construction: proving three credential types
   > classify without misrouting — the two RS256-presenting types especially."

   Saying this stops the table trimming the wrong thing. Tests are where the appetite actually goes.
3. **The risk that could blow it**, with the pre-work that sizes it before anyone commits.

**Scope cuts, in priority order, most droppable first.** Each with what shipping without it costs and
whether it's reversible. Then state the **must-not-cut core** — the two or three things that, if cut,
mean you didn't do the bet.

"Steel-thread one case end-to-end before generalizing" belongs on nearly every scope-cut list.

**Conditional scope is legitimate.** The user-auth pitch bets one week firmly and a second week only
if an open question resolves favourably — and says exactly which question and which way. That is
better than averaging the two into a number that is wrong either way.

## §3 Solution — argue-with-able, not finished

**How it works.** Prose and bullets. Bold the name of each component or seam. Enough that a reader can
push back; not so much that the implementer has nothing left to decide.

**Design Decisions table.** One decision per row, rationale that survives the room emptying. These
become **ADRs when the bet is won** — write them as if they will be, because they will.

**What we know going in.** A `Question | Answer` table where every row is a confirmed fact with a
citation: `path:line`, a release note, a spec version, a Lisa investigation. The pitches say this
out loud —

> "No spike numbers to invent — these are confirmed facts."

If you don't know, it goes in Open Questions, not here. Then **name the load-bearing finding**:

> "The load-bearing finding is the second row: the new credential collides with the site-JWT path on
> the RS256 signal and is silently 401'd. Classification — not exchange — is the work."

**API Shape.** Commented sketches of the *seam*, not the implementation. Interfaces, types, the one
function whose signature is the decision. Fifteen lines beats fifty.

**Integration.** Numbered, naming files and modules — and naming what is **explicitly unchanged**.
"Southbound: no change." is a load-bearing line, not filler.

**Definition of Done.** Concrete enough that someone else can verify it without asking you. Include
the **negative** assertions ("byte-for-byte unchanged", "no regression in the two existing paths")
and the end-to-end proof.

**Pre-work.** Half a day to a day, before the table commits, answering the one question that could
change the bet. Always with the same logic: *cheapest possible way to find out this is wrong before
betting on it.* If you cannot name a pre-work item, you probably do not know where the risk is.

## §4 Open Questions — every one gates something

Label them `OQ1..OQn`, mark the highest-leverage one, and give each a **Gates:** line saying what it
determines — which design, which appetite, whether a piece is possible at all.

> "**Gates:** the classifier shape (chain vs lookup vs header-read) **and** whether per-user rate
> limiting can run pre-auth at all. A distinct signal collapses classification to a lookup and
> shrinks the appetite toward 1 week."

A question that gates nothing is a curiosity — cut it. State your instinct as an instinct
("**Instinct:** the exchange endpoint is the authority") and still ask for the decision.

## §5 Rabbit Holes — temptations, not risks

A table: `Temptation | Why It's a Trap`. Each row is something **a competent person would genuinely
be tempted to do**, that sounds correct, and that would eat the appetite.

- ✅ "Cryptographically validating the access token in the gateway" — someone will argue for it, and
  it pulls in a JWKS dependency that doubles the bet.
- ✅ "Migrating all six modules while we're in here."
- ❌ "It might take longer than expected." That is a risk, not a rabbit hole, and naming it helps
  nobody.

**Name them; do not solve them.** Solving a rabbit hole in the pitch is over-resolution, and
over-resolved pitches are the classic shaping failure.

## §6 No-gos — the hard edges

Absolute prohibitions for this bet, usually the hard-edged form of a rabbit hole. Include the
compatibility promises: no breaking X, no changing Y, no touching Z.

Not table stakes. "Won't crash" is not a no-go. A no-go is something a reasonable person might
otherwise do, that this bet is explicitly ruling out.

## §7 Follow-up — where the cuts go to survive

Numbered, each with why it's deferred and what would trigger picking it up. The §2 scope cuts and the
real-work rabbit holes reappear here. This is what makes cutting scope feel like a decision rather
than a loss.

---

## Where it lands in the tree

One addition to the house format, and it belongs in §3 near Integration: **which packages this
touches, and whether it needs packages that do not exist yet.**

A reviewer who spots "this responsibility has nowhere to live" saves the whole appetite. And if the
pitch would contradict an accepted ADR, name it with its `reversal_cost` — a pitch that quietly
reverses a `reversal_cost: high` decision is the most expensive surprise a table can be handed.

Keep it to a few lines. Naming the landing zone is not the same as allocating the work — allocation
is Willie's, after the bet is won.

## What happens after

| Outcome | Next |
|---|---|
| bet placed | the pitch becomes tickets; each is a Dr. Nick or Willie session. The Design Decisions table becomes ADRs. |
| not this cycle | leave the file, set `Status: Shelved` — a shelved pitch is a real asset |
| shape was wrong | revise and re-pitch; do not quietly turn it into a design doc |

Emit `SHAPED` and stop. Shaping and specifying in one session is how a pitch ends up at the
resolution of a design doc, which makes it useless for deciding.

---

## Failure modes

1. **A problem section that is a feature request.** "We should have a client library" is not a
   problem. "Every team copies the OAS by hand and guesses at versioning" is.
2. **Estimating instead of constraining.** The appetite is how much this is *worth*, not how long it
   will take. If the solution doesn't fit, cut the solution.
3. **Inventing numbers for "What we know going in."** Every row is a citation or it is an Open
   Question. A confident guess in that table poisons every decision built on it.
4. **Solving the rabbit holes.** Name and move on.
5. **Generic rabbit holes.** If it could appear in any pitch, it belongs in none.
6. **Skipping the pre-work item.** Not knowing what the cheapest de-risking question is usually means
   not knowing where the risk is.
7. **No must-not-cut core.** Without it, the table can trim the bet down to something that isn't
   worth doing and nobody notices until it ships.
8. **Open Questions that gate nothing.** Every OQ gets a `Gates:` line or gets cut.
9. **Designing to completion.** If the implementer has no decisions left, you wrote a design doc and
   put the wrong emoji on it.
10. **Guessing the cycle/pitch number.** It's `NN` until the table says otherwise.
