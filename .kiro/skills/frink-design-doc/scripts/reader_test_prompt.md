# Reader Test Prompt

The reader test catches one specific failure mode: a design doc that only makes sense if you were in the conversation that produced it. The test is to paste the doc into a fresh Claude (or hand it to a human reviewer with no prior context on the project) and see whether the doc carries its own meaning.

## How to run the test

After producing a draft, ask the user:

> "Want to run the reader test? I'll prep a prompt you can paste into a fresh Claude session — it'll surface anything that only makes sense if you were in the room when this was designed."

If they accept, give them the prompt below with the doc inlined or attached.

## The prompt

```
You're reviewing a design document. You have no prior context on this project — only what's in the document itself. Read it through, then answer:

1. **Contract.** In your own words, what is this component supposed to do? List its entry points and what each one promises.

2. **Architecture.** What are the major components, and what is each one's responsibility?

3. **Decisions.** What were the load-bearing choices, and what was the alternative for each?

4. **Risks.** What is this design *not* certain about? Where are the open questions?

5. **Acceptance.** Pick three acceptance criteria. For each, describe how you would test it.

6. **Confusion.** What parts of the document didn't make sense to you, or required you to guess at meaning the document didn't supply?

Be specific. If something was unclear, name it. If something was clear, name what made it clear so the author can do more of it.

---

[Paste the design document below]
```

## Interpreting the response

The fresh Claude's responses to questions 1–5 should match the author's intent. Mismatches indicate where the doc is ambiguous.

Question 6 is the gold mine. The fresh reader will name specific paragraphs that required guessing. Those paragraphs need editing — usually adding the implicit context that the original conversation made redundant.

## What "passing" looks like

The doc passes the reader test if:

- The fresh Claude's contract description matches the doc's Contract section without inventing or losing entry points.
- The architecture summary correctly identifies each component and its responsibility.
- The decisions are correctly attributed to their alternatives and rationales.
- Question 6 surfaces no major confusions (some minor word-choice nits are normal and acceptable).

## What "failing" looks like

If the fresh Claude:

- Invents entry points that aren't in the doc, or misses ones that are.
- Conflates two components into one or splits one into two.
- Can't tell what each decision's alternative was.
- Asks "what is X" for something the doc treats as load-bearing terminology.

— then the doc has a comprehension gap. Identify the gap, edit the section, run the test again. Don't skip past a failed reader test by rationalizing ("oh, that's because they don't know about Y" — *that's the point*; the next reviewer also won't know about Y).

## When to skip the reader test

Low-stakes docs (an ADR for a small library upgrade, a minor design tweak) don't need it. The test is most valuable for:

- Long docs (full template).
- Cross-cutting designs (touching multiple teams or services).
- Designs with significant brownfield notes (the migration story is hard to write clearly).
- Designs that introduce new vocabulary or new patterns to the codebase.
