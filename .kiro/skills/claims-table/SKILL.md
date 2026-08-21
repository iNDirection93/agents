---
name: claims-table
description: Decomposes a design document into a structured claims table — a row-per-claim artifact where each row carries an EARS-form claim, a kind (precondition / postcondition / invariant / perf / security / ux), a confidence rating, and pointers to test code and Drift-anchored implementation symbols. Use whenever the user has a design doc and wants acceptance criteria extracted, a claims table generated, a verification matrix, a test plan derived from a spec, a list of testable assertions, or wants the design's Acceptance Criteria section turned into a machine-readable artifact. Use this even when the user phrases it as "what would I test" or "what's the test plan" if the source is a design doc. Do not use to write the test code itself, generate Gherkin step definitions, modify the source design doc, or do open-ended testing strategy from prose that isn't structured acceptance criteria.
---

# claims-table

This skill takes a design document — typically one produced by the `frink-design-doc` skill — and turns its Acceptance Criteria section into a structured claims table. The table is the durable artifact that:

1. A reviewer can scan to see what the design promises and how each promise is verified.
2. A test author can use as a worklist (one row, one test).
3. The Drift linter can cross-reference: every row's `drift_anchor` is a binding that fails CI when the underlying code changes without the design being re-reviewed.
4. CI / coverage tooling can use to detect claims without tests, tests without claims, and stale anchors.

The skill emits three artifacts from one source doc:

- **`claims.json`** — machine-readable, validates against `schemas/claims.schema.json`.
- **`claims.md`** — human-readable markdown table.
- **`<feature>.feature`** (optional) — Gherkin scenarios for projects using Cucumber/SpecFlow/Behave.

## What this skill does NOT do

- **Write tests.** That's a separate concern. This skill produces the worklist; an implementing agent or human writes the tests. Test code is not in this skill's output.
- **Modify the source design doc.** Round-tripping introduces edit conflicts and surprise diffs. If a claim is wrong, the user fixes the design doc and re-runs extraction.
- **Decide confidence.** Confidence comes from structural signal (does the test exist? does the code exist?). The rubric is mechanical, not editorial. If the user wants to override, they edit `claims.json` directly.
- **Extract from arbitrary prose.** The skill expects a design doc with a structured Acceptance Criteria section. Prose-only specs surface the wrong shape; ask the user to add an AC section first (or to invoke `frink-design-doc` to produce one).

## Workflow

### Phase 1: Locate and parse

Read the source design doc (default: `design/<name>.md`; user can specify another path). Find the Acceptance Criteria section (the section header contains "Acceptance Criteria"). Confirm with the user the section was found and looks reasonable before proceeding.

If the doc has no Acceptance Criteria section, stop. Tell the user what's missing and offer two paths:

- They can add the section (and probably want the `frink-design-doc` skill).
- They can confirm extraction from prose, accepting that the result will be lower confidence (`confidence: assumed` defaults across the board) and require manual review.

### Phase 2: Extract rows

For each row in the AC table, extract:

- **id** — must match `AC-\d+` pattern.
- **claim** — the EARS-form claim text.
- **kind** — from the Kind column.
- **confidence** — from the Confidence column. Validated against the rubric.
- **test_anchor** — string or "pending".
- **drift_anchor** — `path#Symbol` or "pending".

Also extract from the doc's frontmatter or first-heading area:

- **component_name** — from the `# Design: <Name>` header.
- **doc_path** — relative to repo root.

### Phase 3: Enrich and validate

For each row:

1. **Resolve test anchors.** If `test_anchor` is a path::name reference, check whether the test exists in the repo. If yes and `confidence` is `asserted`, suggest promoting to `tested`. If the user accepts, update.
2. **Resolve Drift anchors.** If `drift_anchor` is a `path#Symbol` reference, check whether the file exists. If not, flag in output (Drift will report this anyway, but it's nice to catch early).
3. **Infer kind from EARS pattern** as a sanity check. If the user wrote "When X, the system shall always Y" but tagged it `precondition`, surface the mismatch — probably should be `invariant` or `postcondition`. Don't auto-correct; surface to the user.
4. **Cross-reference.** If the same `drift_anchor` appears in multiple rows, that's expected (one symbol implements multiple claims). If the same `test_anchor` appears in multiple rows, also expected. Report counts, don't error.

### Phase 4: Render

Emit:

- `claims.json` to `design/.claims/<doc-name>.claims.json` (default; configurable). Validates against `schemas/claims.schema.json`.
- `claims.md` to `design/.claims/<doc-name>.claims.md`. Human-readable rendering with kind, confidence, anchors as columns and a header row showing claim counts by kind and confidence.
- `<feature>.feature` to `tests/features/<doc-name>.feature` *only if* the user opts in (Gherkin is project-specific; not everyone uses it).

For Gherkin rendering, EARS maps as follows:

| EARS pattern | Gherkin shape |
| --- | --- |
| Ubiquitous | `Scenario: <claim summary>` / `Given <system in normal state>` / `Then <response>` |
| Event-driven | `Scenario: <trigger summary>` / `Given <prior state>` / `When <trigger>` / `Then <response>` |
| State-driven | `Scenario: <state summary>` / `Given <state>` / `When <event in that state>` / `Then <response>` |
| Optional feature | `Scenario: <feature summary>` / `Given <feature is enabled>` / `When <event>` / `Then <response>` |
| Unwanted behavior | `Scenario: <error summary>` / `Given <prior state>` / `When <unwanted trigger>` / `Then <response>` |

The Gherkin file is a starting scaffold, not a finished test. The user (or an implementing agent) wires up step definitions; this skill doesn't write step code.

### Phase 5: Coverage report

After rendering, run `scripts/coverage.py` against the new `claims.json` to surface:

- **Claims without tests** — rows where `test_anchor` is `pending` or doesn't resolve.
- **Tests without claims** — test files that exist but aren't referenced by any row (best effort; uses simple file-name matching, may have false positives).
- **Pending Drift anchors** — rows where `drift_anchor` is `pending` (greenfield not yet implemented).
- **Stale Drift anchors** — rows where `drift_anchor` points at a file that doesn't exist.

This is informational; surface to the user, don't fail.

## Confidence rubric

Confidence is a structural property. The defaults:

| Confidence | Meaning | Trigger |
| --- | --- | --- |
| `verified` | Empirically demonstrated under realistic conditions. | A benchmark or integration test passes; a production metric confirms the property. |
| `tested` | Unit or integration test exists and passes for this claim. | The `test_anchor` resolves to a real, passing test in the repo. |
| `asserted` | The implementation exists and is presumed to fulfill the claim, but no test directly verifies it. | The `drift_anchor` resolves to a real symbol in the repo, but no test anchor exists. |
| `assumed` | The implementation does not yet exist; the claim is a target. | Greenfield. `drift_anchor` is `pending` or doesn't resolve. |
| `speculative` | The claim itself is uncertain — the design hasn't committed to whether this is a real obligation. | Author flagged the row with hedging or marked it explicitly. |

Default policy: an unspecified row gets `assumed` if the symbol doesn't exist, `asserted` if the symbol exists but no test anchor, `tested` if the test exists. Never auto-promote to `verified`; that requires explicit user confirmation.

## Kind taxonomy

See `references/claim-kinds.md` for the full taxonomy with worked examples. The short version:

- **precondition** — caller's obligation; usually a state guard, configuration, or input shape.
- **postcondition** — implementation's obligation on a specific event or call.
- **invariant** — property that holds across the lifetime of the entity, regardless of inputs.
- **perf** — latency, throughput, resource budget.
- **security** — authn, authz, data sensitivity, threat-model response.
- **ux** — observable behavior of a user-facing surface (response shape, error messages, ordering).

Most rows are `postcondition`. `invariant` is the second most common. Heavy `precondition` count usually means the contract is over-specified — preconditions belong in the contract section, not the claims table.

## Anchor handoff

This skill emits anchors in the syntax Drift expects (`path#Symbol`) but does not invoke `drift link`. The Drift skill owns linking. Workflow:

1. This skill produces `claims.json` with anchors.
2. Implementation lands.
3. The Drift skill runs `drift link` to stamp `drift.lock`.
4. CI runs `drift check`; code changes that drift from anchors fail.

If a claim's anchor is `pending`, that's the implementer's signal to either implement the symbol and link it, or to come back and update the claim.

## Failure modes

1. **Extracting from prose with no AC table.** Output is full of `assumed` confidences and the user thinks they have coverage. Don't do this without explicit consent.
2. **Auto-promoting confidence.** Default down, not up. `verified` requires evidence stronger than "the test exists".
3. **Modifying the source doc.** Don't. Round-tripping is brittle; users get edit conflicts and lose work.
4. **Generating Gherkin nobody asked for.** Make it opt-in. Most teams don't use Cucumber.
5. **Writing test code.** Out of scope. The claims table is the worklist; tests are downstream.
6. **Treating same drift_anchor across rows as a bug.** It's not — one symbol can satisfy multiple claims. Report, don't error.
