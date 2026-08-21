# Design: <Component Name>

> One-line summary. What this is, in fifteen words or fewer.

**Status:** draft | review | accepted | superseded
**Author(s):** <name(s)>
**Reviewers:** <name(s)>
**Date:** <YYYY-MM-DD>

---

## Problem & Context

One paragraph. What is the situation, what hurts, why now? Avoid solution language; if you catch yourself writing "we will" or "the system shall", that belongs in Solution Overview.

## Goals

- <Falsifiable goal — a reader can verify whether it's met>
- <...>

## Non-goals

- <Goal a reasonable reviewer might assume is in scope, but isn't>
- <...>

## Solution Overview

Two to four paragraphs. The contract this component fulfills, and the architectural primitives chosen to fulfill it. A reviewer who stops reading here should know *what* is being built and *why this shape*. Code declarations come later.

State the entry points of the contract explicitly:

- **<entry point name>**: <one-sentence promise>
- **<entry point name>**: <one-sentence promise>

State the lifecycle: <when does this component come into existence, when does it stop>.

State explicit non-promises (boundaries that matter): <what this component does NOT do, even though a reader might expect it to>.

## Detailed Design

### <Component Name>

**Responsibility:** <one sentence — single purpose>
**Pattern:** <registry | decorator | builder | strategy | repository | dispatcher | none>
**Covers:** <which entry points of the contract>

<!-- @./path/to/file.ext#SymbolName -->
```python
# Interface sketch — this is the SPI consumers depend on
class ComponentInterface(Protocol):
    def method(self, arg: Arg) -> Return: ...
```

```python
# Usage example — pedagogical, not anchored
async def example_consumer(c: ComponentInterface) -> None:
    result = c.method(arg)
    ...
```

### <Next Component Name>

[Repeat the structure above for each component.]

## SPIs Between Components

The load-bearing contracts that hold under refactoring.

<!-- @./path/to/spi.ext#SPIName -->
```python
class ComponentBLookup(Protocol):
    def lookup(self, key: Key) -> ComponentB | None: ...
```

## Data Flow

Two to four sentences describing how data moves through the components to fulfill the contract. A small diagram (mermaid, ascii) is fine if it adds clarity. If you need more than four sentences, the decomposition is probably wrong.

## Decisions

The ≤3 most load-bearing choices. For each, copy the block from `adr-block.md`.

### Decision: <Title>

**Context.** What forced this choice.

**Considered.**
- Option A: <one line>
- Option B: <one line>
- Option C: <one line>

**Chose.** Option <X>.

**Why.** <The rationale that made this option preferred. Reference the contract clauses or quality requirements being optimized for.>

**Consequences.** <What we accept by choosing this. Include both upsides and downsides.>

## Risks & Open Questions

- **<Named risk>** — <rough size; what would we do about it; who owns watching it>
- **<Open question>** — <what we don't know; what would resolve it; when we need an answer>

## Acceptance Criteria

The structured table the `claims-table` skill consumes. EARS-form claim text, confidence from the rubric, anchors when known.

| ID    | Claim                                                                 | Kind          | Confidence | Test Anchor                          | Drift Anchor                  |
| ----- | --------------------------------------------------------------------- | ------------- | ---------- | ------------------------------------ | ----------------------------- |
| AC-1  | When <trigger>, the <component> shall <response>.                     | postcondition | asserted   | tests/<file>.py::<test>              | path/file.ext#Symbol          |
| AC-2  | While <state>, the <component> shall <response>.                      | invariant     | assumed    | pending                              | path/file.ext#Symbol          |
| AC-3  | If <unwanted trigger>, then the <component> shall <response>.         | postcondition | speculative | pending                             | pending                       |

EARS pattern reference (full version in `references/ears-patterns.md`):

- **Ubiquitous:** The `<system>` shall `<response>`.
- **Event-driven (When):** When `<trigger>`, the `<system>` shall `<response>`.
- **State-driven (While):** While `<state>`, the `<system>` shall `<response>`.
- **Optional feature (Where):** Where `<feature>`, the `<system>` shall `<response>`.
- **Unwanted behavior (If/Then):** If `<trigger>`, then the `<system>` shall `<response>`.

## Brownfield Notes

*Skip this section if greenfield.*

What existing code situation does this design replace? Specifically:

- Where current responsibilities are tangled: <theorized location>
- What needs extracting: <responsibility, target component>
- What needs inverting: <dependency, target shape>
- What needs removing: <code/feature/path>

The decomposition agent will use this to plan the migration; be specific enough that the migration plan can write itself.

## Changelog

| Date       | What changed              | Why                                       | Reference |
| ---------- | ------------------------- | ----------------------------------------- | --------- |
| YYYY-MM-DD | Initial draft             | <feature, decision, etc.>                 | <PR/issue> |
