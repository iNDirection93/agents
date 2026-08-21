---
name: steering-doc
description: Authors and validates the per-package knowledge artifacts — .steering/*.md, .design/adrs/NNNN-*.md, .design/DESIGN_CHANGELOG.md, and ephemeral implementation guides. Use after a design conversation has reached decisions and the result needs writing down next to the code it governs, when the user says "write the steering doc", "record this as an ADR", "update the package docs", or when a harvest bead asks for a doc to be corrected. Provides templates for all four artifacts and validate.py, which enforces the frontmatter schemas, section order, claim/anchor consistency, and the leanness limits. Do not use for legacy monolithic design/*.md docs (that is frink-design-doc), for README authoring, or to do the architectural reasoning itself.
---

# steering-doc

This skill writes down what a design conversation decided, in the four shapes the knowledge graph
uses. It is a **translator, not a thinker** — by the time it runs, the decisions exist.

Read `.kiro/prompts/knowledge-graph-conventions.md` first; it defines the layout, the nesting rule,
and the frontmatter schemas. This skill is how you comply with it.

## The four artifacts

| Template | Goes to | Answers | Lifetime |
|---|---|---|---|
| `templates/steering.md` | `<pkg>/.steering/<topic>.md` | "what must I know to work here?" | as long as the package |
| `templates/adr.md` | `<pkg>/.design/adrs/NNNN-<slug>.md` | "why is it this way?" | forever; superseded, never edited |
| `templates/design-changelog.md` | `<pkg>/.design/DESIGN_CHANGELOG.md` | "when did the design move?" | append-only |
| `templates/implementation-guide.md` | `<pkg>/.design/guides/<TICKET>-*.md` | "how does this become beads?" | **one ticket, then deleted** |

Choosing between them:

- A **decision** with alternatives that lost → ADR. Always. Even a small one, if reversing it would
  cost something.
- A **constraint someone must know before editing** → steering, in *Must know before you touch this*.
- A **fact about how the code works** → neither. That's what the code is for. Writing it down creates
  something that can go stale for no benefit.
- **Scaffolding for decomposition** → implementation guide, and only if an ADR plus steering genuinely
  isn't enough for Willie.

## Writing a steering doc

The discipline is subtraction. A steering doc is loaded *in full* every time an agent enters the
package, so every line costs on every future session in that package.

1. **Write `owns` first.** One sentence, no "and" joining two responsibilities. If you can't, you're
   documenting two packages — go back to the nesting rule before you write another word.
2. **Write the claims.** EARS form, falsifiable. "The system is fast" is not a claim; "When the
   upstream call exceeds 30s, ToolProxy shall return a timeout error rather than blocking" is. Claims
   are the part of a steering doc that can be *checked*, which makes them the part worth most.
3. **Write *Must know* last, and cut it twice.** For every bullet: could a competent reader work this
   out in 30 seconds by opening the file? Then delete it. What survives is the stuff that isn't
   visible from the code — orderings, assumptions, the reason a check exists.
4. **Point, don't paste.** Anchors, not code blocks. A code block over 10 lines fails validation, and
   that limit exists because pasted code is the fastest-rotting content in any doc.
5. **Anchors mirror `covers:`.** Every `@./path#Symbol` line in *Code anchors* should appear in
   frontmatter `covers:` — that's what `link-steering.sh` projects into `drift.lock`.

### The 120-line limit

It's a forcing function, not a formatting rule. Over the limit means one of three things, and the fix
differs:

| Cause | Fix |
|---|---|
| The package does two things | split the package (nesting rule) |
| The doc narrates the code | delete the narration; add anchors |
| Decisions leaked into steering | move them to ADRs and link by id |

## Writing an ADR

The frontmatter is a **scan surface**. Dr. Nick reads every ADR head in a package and opens only the
bodies that matter, so `context` / `problem` / `decision` / `consequences_short` each have to stand
alone in one sentence. If the head doesn't tell a reader whether they need the body, the head failed.

`reversal_cost` is the field that decides who reads the body later. Be honest: high means "we will
live with this for years", and marking something high that isn't teaches people to ignore the field.

**Options are the load-bearing section.** An ADR with one option is a diary entry. Record what the
obvious alternatives were and the specific reason each lost — "it was worse" is not a reason, and in
two years the only thing anyone wants from this file is exactly that comparison.

ADRs are immutable. Reversing a decision means a **new** ADR and setting the old one to
`status: superseded-by NNNN`. Never edit the reasoning of a past decision to match a present one;
that destroys the ability to tell "we chose wrong" from "the world changed".

## Validating

```bash
V=.kiro/skills/steering-doc/scripts/validate.py

python3 $V <pkg>/.steering/transport.md      # one file
python3 $V --package <pkg>                   # a package's steering + ADRs
python3 $V --all                             # the whole repo
python3 $V --self-test                       # the shipped templates
```

Errors fail (exit 1). Warnings never do — they're judgement calls, and a script doesn't get to make
those. What it checks:

- frontmatter fields present, `status` / `reversal_cost` from their vocabularies, lists actually lists
- `package:` matches the directory the file lives in
- required sections present **and in order**; no `Changelog` section in steering
- ≤120 lines; no code block >10 lines
- claim IDs match `PREFIX-NNN`, statuses from the vocabulary, EARS shape (warn)
- **frontmatter `claims` and the claims table agree, in both directions** — the most common real
  breakage, because people add a row and forget the head
- anchors parse; anchors missing from `covers:` are flagged as unstampable
- ADR id matches filename; ≥2 options (warn); frontmatter heads short enough to scan

Run it before you commit. Fix what it says rather than arguing with it — and if a rule is wrong,
change the rule in the conventions doc, not just this one file.

## Implementation guides

Only when an ADR plus steering isn't enough for Willie to decompose. Then:

- write it to `<pkg>/.design/guides/<TICKET>-implementation-guide.md`;
- put the **package allocation** in it (that's the part Willie can't derive);
- **nothing may cite it** — not steering, not an ADR, not a bead description;
- Willie deletes it in the session that consumes it.

If you find yourself putting something durable in a guide, stop: it belongs in steering or an ADR
*before* the guide dies. A guide that outlives its ticket is a decoy — it looks like a system of
record and isn't one.

## Failure modes

1. **Documenting what the code says.** The single most common way steering docs get long and useless.
2. **`owns` with an "and".** Almost always two packages wearing one coat.
3. **Claims that can't fail.** If no observation could contradict it, it's a slogan.
4. **One-option ADRs.** Write the alternatives down while you still remember why they lost.
5. **Editing an ADR to match a new decision.** Supersede it instead.
6. **Leaving a changelog section in steering.** It moved so steering could stay lean.
7. **Guides that become references.** Delete on consumption. No exceptions.
8. **Anchors on illustrative snippets.** Anchor contracts, not tutorials — an anchored example goes
   stale every time someone improves the example, and false drift signal teaches people to re-stamp
   without reading.
