# Design: <Component Name>

> One-line summary.

**Status:** draft | review | accepted | superseded
**Author(s):** <name(s)>
**Reviewers:** <name(s)>
**Date:** <YYYY-MM-DD>
**Target version:** <release/sprint>

---

## 1. Introduction & Goals

### 1.1 Problem & Context

One to two paragraphs. Situation, pain, why now. No solution language.

### 1.2 Goals

Falsifiable goals, two to five.

- <Goal>
- <Goal>

### 1.3 Non-goals

Plausible-but-excluded goals.

- <Non-goal>
- <Non-goal>

### 1.4 Stakeholders

| Role | Name | What they care about |
| --- | --- | --- |
| <e.g., on-call> | <name> | <e.g., observability, alerting, runbook impact> |
| <e.g., security> | <name> | <e.g., authn/authz boundaries> |

## 2. Constraints

Hard constraints the design has to live within. Distinguish:

- **Technical:** <e.g., must run on existing Kubernetes platform; Python 3.11+>
- **Organizational:** <e.g., owned by a single team; no cross-team dependencies>
- **Regulatory:** <e.g., SOC 2 audit boundary; PII handling rules>

## 3. Context & Scope

### 3.1 Business context

What part of the business this serves and what neighboring systems exist.

### 3.2 System context

External actors and systems this design interacts with. (C4 System Context diagram, if applicable.)

### 3.3 Out of scope

What's explicitly *not* this design's problem to solve, even though it touches.

## 4. Solution Strategy

The contract and the chosen architectural primitives, in prose. This is the one-page summary that lets a reviewer understand the shape without reading the rest. Two to four paragraphs.

State the contract entry points:

- **<entry point>**: <one-sentence promise>
- **<entry point>**: <one-sentence promise>
- **Lifecycle**: <when this exists, when it stops>
- **Non-promises**: <what this explicitly does NOT do>

State the load-bearing primitives chosen and why each one's known properties earn its place. Don't explain what a registry is; explain why a registry is what's needed here.

## 5. Building Blocks (Detailed Design)

### 5.1 Top-level decomposition

Brief prose on the component split. (C4 Container or Component diagram if it helps.)

### 5.2 <Component A>

**Responsibility:** <one sentence>
**Pattern:** <registry | decorator | builder | ... | none>
**Covers:** <which entry points>

<!-- @./path/to/file.ext#ComponentA -->
```python
class ComponentA(Protocol):
    def method(self, ...) -> ...: ...
```

```python
# Usage example
...
```

### 5.3 <Component B>

[Repeat.]

## 6. SPIs Between Components

<!-- @./path/spi.ext#ALookup -->
```python
class ALookup(Protocol):
    ...
```

[One block per SPI.]

## 7. Runtime View

Sequence of how the components interact at runtime. Cover the major flows of the contract — at minimum, one happy-path scenario per entry point, plus the most plausible failure modes.

### 7.1 <Scenario name>

```
ConsumerX → Dispatcher.dispatch(req)
          → Registry.lookup(req.key)
          → Handler.handle(req)
          → returns Response
```

[One subsection per major scenario.]

## 8. Deployment View

Where this runs, how it's deployed, lifecycle in production. Skip if standard for the org.

## 9. Crosscutting Concerns

### 9.1 Observability

Logs, metrics, traces. What's emitted at each component boundary; what alerts fire.

### 9.2 Security

Trust boundaries, authn/authz, data sensitivity. Where are the privilege transitions?

### 9.3 Performance

Latency budget, throughput targets, resource budget. Be specific or say "not bounded".

### 9.4 Failure & Recovery

How this fails, how it recovers, what's idempotent vs. not, retry semantics.

### 9.5 Privacy & Data

PII handling, retention, residency, deletion paths.

## 10. Decisions

The load-bearing decisions. MADR-style blocks; copy from `adr-block.md`. Three to seven blocks; if you need more, the design is probably too big and should split.

### 10.1 Decision: <Title>

**Context.** <What forced this choice.>

**Considered.**
- Option A: <one line>
- Option B: <one line>
- Option C: <one line>

**Chose.** Option <X>.

**Why.** <Rationale tied to contract or quality requirements.>

**Consequences.** <What we accept.>

[Repeat per decision.]

## 11. Quality Requirements

Quality goals beyond functional correctness, with rough targets. This is what the Acceptance Criteria below operationalize.

| Quality | Target | Rationale |
| --- | --- | --- |
| Latency (p99) | <e.g., <50ms> | <why> |
| Availability | <e.g., 99.9%> | <why> |
| Throughput | <e.g., 5k QPS sustained> | <why> |
| Recovery | <e.g., RTO 5min, RPO 1min> | <why> |

## 12. Risks & Open Questions

| Item | Kind | Size | Owner | Resolution |
| --- | --- | --- | --- | --- |
| <Risk or question> | risk \| open-question | small \| medium \| large | <name> | <how/when resolved> |

## 13. Acceptance Criteria

The claims table. The `claims-table` skill consumes this directly.

| ID    | Claim                                                              | Kind          | Confidence | Test Anchor             | Drift Anchor          |
| ----- | ------------------------------------------------------------------ | ------------- | ---------- | ----------------------- | --------------------- |
| AC-1  | The <system> shall <response>.                                     | postcondition | asserted   | pending                 | path#Symbol           |
| AC-2  | When <trigger>, the <system> shall <response>.                     | postcondition | asserted   | tests/x.py::test_y      | path#Symbol           |
| AC-3  | While <state>, the <system> shall <response>.                      | invariant     | assumed    | pending                 | path#Symbol           |
| AC-4  | Where <feature> is enabled, the <system> shall <response>.         | postcondition | speculative | pending                | pending               |
| AC-5  | If <unwanted trigger>, then the <system> shall <response>.         | postcondition | asserted   | pending                 | path#Symbol           |

EARS reference: see `references/ears-patterns.md`.
Confidence rubric: `verified | tested | asserted | assumed | speculative`.

## 14. Brownfield Notes

*Skip if greenfield.*

What current code situation does this replace? Be specific:

- **Tangled responsibilities at:** <path:line>
- **Extract:** <responsibility> → <target component>
- **Invert:** <dependency> so that <component> no longer knows about <other>
- **Remove:** <code/feature/path>
- **Migration order:** <what has to ship before what>

## 15. References

- Prior design docs: <links>
- Related ADRs/RFDs: <links>
- External references (papers, RFCs, blog posts): <links>

## 16. Glossary

| Term | Definition |
| --- | --- |
| <term> | <one-sentence definition> |

## 17. Changelog

| Date       | What changed         | Why                          | Reference |
| ---------- | -------------------- | ---------------------------- | --------- |
| YYYY-MM-DD | Initial draft        | <feature/decision>           | <PR/issue> |
