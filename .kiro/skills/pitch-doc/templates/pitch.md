# YYYY Cycle N Pitch NN: <Name — what you'd call it out loud>

**Team:** AI Tools Platform (ATP)   
**Author:** <name>   
**Date:** YYYY-MM-DD   
**Status:** Shaping   
**Feature Set:** **<the product area this belongs to>**

> Cycle / Pitch number is a placeholder — set at the betting table.
> <Provenance: shaped from which design session, grounded in which reconnaissance.>
> <Hard dependencies, and anything **owned by another team — say so explicitly**.>

---

## 🔍 1. Problem

**<One bold sentence naming the real problem — and, where the obvious framing is wrong, naming the trap in it.>**

<Two to four paragraphs. What is true today, concretely, with `path:line` where it is a code fact.
If there is an incident, lead with it: a thing that already went wrong beats a thing that might.>

<**Name the trap in the framing.** The naive statement of this work ("just bump the SDK", "accept
the new token alongside API keys") usually puts the cost in the wrong place. Show where the work
actually is. If the framing is honest and the work is where it looks, say that instead — but check
first, because a pitch that relocates the cost is worth ten that restate the ask.>

<**Then say why it's contained** — what is already built, already paid for, already reusable. This
is what turns "sounds enormous" into a bet somebody will take.>

**Enabling conditions:** <why this is possible *now* and wasn't before. A dependency that landed, a
precondition already paid, a spec that got published. If there is no enabling condition, ask
yourself why this is being pitched this cycle.>

**Requirements:**

- [ ] <Falsifiable statement of what must be true when this is done>
- [ ] <One per promise. These are what the table is agreeing to, so no vague ones.>
- [ ] *(Optional)* <mark genuinely optional requirements as optional>

---

## ⏳ 2. Appetite

**<N dev(s), N week(s).>** <One sentence on why the number is what it is.>

<Why it is smaller (or larger) than it looks. Name what is **reused** versus what is **built** —
reuse is usually the whole reason a scary-sounding bet fits in the appetite.>

| Work | Size |
| :---- | :---- |
| <the piece> | ~N day(s) |
| Tests + no-regression verification + integration (**often the real bulk**) | ~N days |

<Name the **load-bearing cost** explicitly. On most of these bets it is verification, not
construction — say so, because that is what stops the table from trimming the wrong thing.>

<Name the **risk that could blow the appetite**, and point at the pre-work that sizes it before
anyone commits.>

**Scope cuts (in priority order):**

1. **<Most droppable first>** — <what shipping without it costs, and whether it's reversible.>
2. **<Next>** — <...>
3. **<Steel-thread one case end-to-end before generalizing>** — <nearly always belongs on this list.>

Must-not-cut core: **<the two or three things that, if cut, mean you didn't do the bet>**.

---

## 💡 3. Solution

### How it works

<Prose plus bullets. The shape, at the resolution someone can react to. Bold the name of each
component or seam being introduced. Enough that a reader can argue with it; not so much that the
implementer has nothing left to decide.>

### Design Decisions

| Decision | Rationale |
| :---- | :---- |
| **<the decision, stated as a decision>** | <why — the specific reason, not "it's cleaner">. |

<These become ADRs when the bet is won. Write them as if they will be — one decision per row, and a
rationale that will still make sense to someone who wasn't in the room.>

### What we know going in

<No invented spike numbers. Every row is a confirmed fact with a citation — `path:line`, a release
note, a spec version, a Lisa investigation. If you don't know, it belongs in Open Questions, not
here.>

| Question | Answer |
| :---- | :---- |
| <the question a skeptical reader would ask> | **<answer>** (`path/to/File.java:142`) |

<Then name it: **the load-bearing finding is <which row>** — and why it changes the shape of the bet.>

### API Shape

```<language>
// === <the seam being introduced> ===
// Commented sketch of the interface, not the implementation. Show the shape and
// the boundary; leave the body to whoever wins the bet.
```

### Integration

1. <Where this touches the existing system, in order.>
2. <Name the files or modules.>
3. **<Anything explicitly unchanged — say so. "Southbound: no change." is a load-bearing line.>**

### Definition of Done

- [ ] <Concrete and checkable. Someone else must be able to verify it without asking you.>
- [ ] <Include the **negative** assertions: what must remain byte-for-byte unchanged, what must not regress.>
- [ ] <Include the end-to-end proof: the integration test that shows the thing actually works.>

**Pre-work, before the betting table (~N day):** <the single cheapest question whose answer could
change the bet — the one that sizes the work or invalidates the approach. State what you'd do and
what it would tell you. "Cheapest way to find out X before betting on it.">

---

## ❓ 4. Open Questions

<Only when there are genuinely unresolved, load-bearing questions. If everything is known, delete
this section and renumber — an Open Questions section full of minor uncertainty devalues the ones
that matter.>

These are **unresolved and load-bearing** — they change the shape and the appetite, and must be
closed at or before the betting table.

**OQ1 — <the question>** *(highest leverage — sizes the whole bet)*
- <the sub-questions that would answer it>
- **Gates:** <what this question determines — which design, which appetite, whether a piece is
  possible at all. Every OQ needs this line; a question that gates nothing is not an open question,
  it's a curiosity.>

**OQ2 — <the question>**
- <options, with your instinct stated as an instinct>
- **Gates:** <...>

---

## 🕳️ 5. Rabbit Holes

| Temptation | Why It's a Trap |
| :---- | :---- |
| **<a specific thing a competent person would genuinely be tempted to do>** | <why it eats the appetite or breaks something. Name it, do not solve it.> |

<Rabbit holes are temptations, not risks. "It might take longer than expected" is not a rabbit hole.
"Cryptographically validating the token in the gateway" is — because someone will argue for it, it
sounds correct, and it pulls in a dependency that doubles the bet.>

---

## 🚫 6. No-gos

- **<An absolute prohibition for this bet.>**
- **<Usually the hard-edged form of a rabbit hole: the temptation named as a rule.>**
- **<Include the compatibility promises: no breaking X, no changing Y, no touching Z.>**

<Not table stakes. "Won't crash" is not a no-go. A no-go is something a reasonable person might
otherwise do, that this bet is explicitly ruling out.>

---

## 📋 7. Follow-up

1. **<Deferred work, named>** — <why it's deferred and what would trigger picking it up.>
2. **<The scope cuts from §2 usually reappear here>** — <each with its re-entry condition.>
3. **<The rabbit holes that are real work, just not this bet>** — <...>
