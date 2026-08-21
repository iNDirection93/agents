---
name: frink-design-doc
description: Authors design documents from architectural reasoning that has already happened in the conversation. Use after Frink (or another design agent) has worked through contracts, primitives, and component decomposition and the user wants the result written to a design.md file in design/. Produces markdown structured for human review, downstream claims extraction, and Drift anchor binding. Use this whenever the user says "write up the design", "make a design doc", "draft the spec", "put this in design/", "create the design.md", or otherwise asks for the architectural conversation to be turned into a durable document. Do not use for README authoring, API reference generation, code summaries, or PR descriptions, and do not use to do the architectural reasoning itself — that's the calling agent's job.
---

# frink-design-doc

This skill takes architectural reasoning that already exists in the conversation and turns it into a design document. It is a *translator*, not a thinker. The five moves (contract, primitives, binary search, pattern recall, brownfield handling) happen in the calling agent's prompt — by the time this skill runs, those decisions are made.

The output is a markdown file in `design/` with a structure that:

1. A human reviewer can read top-to-bottom and follow.
2. The `claims-table` skill can decompose into a structured verification matrix.
3. The Drift linter can anchor to specific code symbols and detect when they drift from the spec.

## What this skill does NOT do

- **Decide the architecture.** The calling agent has already done this. If the conversation doesn't have clear contracts and components, stop and ask the user to go back to the design agent.
- **Run `drift link`.** The Drift skill owns that. This skill emits anchors in the syntax Drift expects, but does not invoke Drift commands.
- **Extract the claims table.** The `claims-table` skill does that as a separate step. This skill produces a Claims section the other skill can consume.
- **Read existing implementation code.** The design doc describes the target, not the current state. If the user wants brownfield context, get it from the user, not from grep.
- **Round-trip.** This skill writes design docs. Edits to existing design docs are a different workflow — ask the user whether to start fresh or amend.

## Workflow

### Phase 1: Capture the reasoning

Before writing anything, extract the architectural decisions from the conversation into a structured intermediate. Write this to scratch (e.g., `/tmp/frink-scratch.yaml` or in the conversation) and confirm with the user before drafting prose.

The intermediate captures:

```yaml
component_name: <one-or-two words, kebab-case>
contract:
  entry_points:
    - name: <verb-phrase>
      promise: <one sentence>
  lifecycle: <when it exists, when it stops>
  non_promises: [<bounded list>]
components:
  - name: <ComponentName>
    responsibility: <one sentence, single-purpose>
    pattern: <registry|decorator|builder|strategy|repository|... or "none">
    covers: [<entry point names>]
    interface_path: <expected code location, e.g. agents/registry.py>
    interface_symbol: <expected symbol, e.g. AgentRegistry>
spis:
  - name: <SPIName>
    between: [<ComponentA>, <ComponentB>]
    path: <expected location>
    symbol: <expected symbol>
data_flow: <2-4 sentence prose>
brownfield: <yes|no>
brownfield_notes: <if yes, what existing code situation, what to extract/invert>
```

If any field is empty or vague, ask the user before continuing. The most common failure mode is silent narrowing of the contract — if a promise looks fuzzy, raise it explicitly rather than guessing.

### Phase 2: Choose template

Two templates ship with this skill:

- `templates/design-doc-minimal.md` — the default. One to two pages. Use this unless one of the escalation conditions below applies.
- `templates/design-doc-full.md` — arc42-influenced. Use when:
  - The component touches a public/external interface (HTTP API, library export, plugin contract).
  - The reasoning surfaced significant risks, unknowns, or quality requirements (perf, security, availability) that need their own treatment.
  - The user explicitly asks for an RFC/RFD/long-form spec.
  - The change crosses team or service boundaries and needs cross-cutting review.

State the template choice and the reason, then ask the user to confirm before drafting. People will sometimes want minimal even when full would be defensible — respect that.

For a single load-bearing decision that doesn't need a full design doc (e.g., "we're switching the queue from RabbitMQ to NATS"), use `templates/adr-block.md` instead and write to `design/adr/`.

### Phase 3: Draft the document

Fill the chosen template section by section, following the section semantics below. Drafting rules:

- **Code-heavy, prose-light.** Interface sketches and SPI declarations belong in fenced code blocks with the right language tag (`python`, `typescript`, `rust`, etc.). Prose explains the *why*, code declares the *what*.
- **Drift anchors on every code symbol the doc treats as load-bearing.** Use the syntax `@./path/file.ext#Symbol` immediately above or beside the code block. See `references/drift-anchors.md` for the exact form and edge cases.
- **EARS form for acceptance criteria.** The Claims section uses the five EARS patterns. See `references/ears-patterns.md`.
- **Confidence ratings on every claim.** Use the rubric `verified | tested | asserted | assumed | speculative`. Default to `asserted` unless the corresponding code or test already exists.
- **No bullet-point dumps in narrative sections.** Goals, Non-goals, Risks tolerate lists; Solution Overview, Data Flow, and Decisions should be prose.

### Phase 4: Validate

Run `scripts/validate.py <path-to-doc>` before considering the draft done. The validator checks:

- Required sections are present.
- Drift anchors parse (path exists in the syntax, symbol is present, no stray `@@`).
- Claims section rows have all required columns and EARS-form claim text.
- Confidence values are from the rubric.
- Changelog has an entry for this version.

Failures are not optional. If the validator complains, fix the doc — don't argue with the script.

### Phase 5: Reader test

Before declaring the doc done, offer the reader test (per `scripts/reader_test_prompt.md`): paste the doc into a fresh Claude with no conversational context and ask it to summarize the contract and identify the load-bearing decisions. If it can't, the doc is too dependent on the conversation that produced it. This catches a big class of "this only makes sense if you were there" failures.

The user can decline the reader test for low-stakes docs. Don't push it on them.

## Section semantics

Each section in the templates is here for a specific reason. Skipping or muddling a section is how design docs decay into ceremony.

**Problem & Context.** One paragraph. What is the situation, what hurts, why now? No solution language. If you find yourself writing "we will" or "the system shall" here, you've leaked into Solution Overview.

**Goals.** What this design accomplishes. Two to five bullets. Each one falsifiable — a reader should be able to look at the finished system and say "yes, this goal is met" or "no, it isn't".

**Non-goals.** Goals that *could plausibly be in scope* but are deliberately excluded. "Won't crash" is not a non-goal (it's table stakes). "Won't support real-time collaboration" *is* a non-goal if real-time collaboration is a thing reasonable readers might assume is in scope. Non-goals are how you prevent scope creep during review.

**Solution Overview.** The contract and the chosen primitives, in prose. Two to four paragraphs. A reader who stops here should know what's being built and why this shape was chosen. The actual interface declarations come later.

**Detailed Design.** The components, their responsibilities, their interfaces. Each component gets a subsection with: responsibility (one sentence), pattern (if applicable), the interface sketch as code with a Drift anchor, and a usage example. If you can't fit the interface in fewer than ~30 lines of code, the component is probably doing too much.

**SPIs.** The contracts between components. These are load-bearing — they're the joins that survive refactoring. Each SPI gets a code block with a Drift anchor.

**Data Flow.** Two to four sentences (or a small diagram) describing how data moves through the components to fulfill the contract. If the flow is so complex it needs more than that, the components are probably wrong.

**Decisions.** MADR-style blocks for the ≤3 most load-bearing decisions. Each block has: context, considered options, decision, consequences. The binary-search-the-contract move from the design phase is exactly what this section captures. See `templates/adr-block.md` for the shape.

**Risks & Open Questions.** Named, owned, with a rough size ("we're not sure if X scales past 10k QPS — needs benchmarking before launch"). Open questions are not a sign of incomplete work; unflagged uncertainty is.

**Acceptance Criteria.** EARS-form claims, numbered, with confidence and (where known) test anchors. This is what the `claims-table` skill consumes. The schema for each row:

| Field | Required | Notes |
|---|---|---|
| ID | yes | `AC-1`, `AC-2`, ... |
| Claim | yes | EARS form |
| Kind | yes | `precondition` / `postcondition` / `invariant` / `perf` / `security` / `ux` |
| Confidence | yes | from rubric |
| Test anchor | no | `tests/<file>::<name>` or pending |
| Drift anchor | no | `path#Symbol` |

**Brownfield Notes.** Only when applicable. What existing code situation does this design replace? What gets extracted, what gets inverted, what gets removed? This is the handoff to whoever decomposes implementation tasks — they need to know the duct tape they're working around.

**Changelog.** Date, what changed, why, link to PR or issue. Append-only. Drift's provenance stamps point at git SHAs; the changelog gives the human-readable narrative.

## Anchor discipline

The full reference is in `references/drift-anchors.md`. The short version:

- Anchor every code block that declares a load-bearing symbol — interfaces, SPIs, SPI implementations, key data structures.
- Do *not* anchor illustrative usage examples (these are pedagogical, not contractual) or pseudo-code.
- Anchor format: `<!-- @./path/file.ext#Symbol -->` placed immediately before the code fence. The HTML comment keeps it invisible in rendered markdown but parseable by Drift.
- For symbols that don't yet exist in code (greenfield), use the same syntax — Drift will report "file not found" until the implementation lands. Mark these acceptance criteria with `confidence: assumed`.
- One anchor per symbol. If a code block declares multiple load-bearing symbols, split it.

## Style notes

The full style guide is in `references/style-guide.md`. The non-negotiables:

- Short sentences. Active voice.
- "We will" beats "it is intended that".
- No marketing adjectives ("seamless", "robust", "powerful", "leverage"). Either the design has these properties, in which case it shows; or it doesn't, in which case the words lie.
- The doc is for a reviewer six months from now who has context but wasn't in the room. Write for that reader.

## Failure modes

Things this skill specifically gets wrong if you let it:

1. **Drifting into reasoning.** If you find yourself deciding what the components should be, stop and tell the user the design conversation isn't complete. The skill is downstream of the thinking.
2. **Inflating confidence.** Default to `asserted`. Only `tested` or `verified` if the test or implementation provably exists.
3. **Skipping the reader test on a long doc.** Long docs are exactly where the test catches the most.
4. **Writing the Claims section as prose.** It's a table. The whole point is that another skill can parse it.
5. **Anchoring usage examples.** Anchors are for contracts, not for tutorials. An anchored usage example creates false drift signal whenever the example evolves.
6. **Filling the full template when minimal would do.** A two-page minimal doc that gets read beats a twelve-page full doc that gets skimmed.
