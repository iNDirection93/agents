---
name: commit
description: "Write git commit messages following project conventions. Use when committing code, writing a commit message, staging changes, or running git commit. Applies prefix rules (ticket key, WIP:, SPIKE:), imperative subjects, WHY-focused bodies, evolution framing for alternatives, and scrubs ephemeral tracking IDs (bead IDs, claim IDs, sprint tags)."
inclusion: auto
---

# commit

This skill defines how to write commit messages in this repository. It is a reference guide, not a generator — apply these rules whenever creating a git commit.

## Quick Rules

1. **Subject**: `<PREFIX>: <imperative summary>` — aim for ≤50 chars, no trailing period.
2. **Prefix**: A ticket key (e.g., `AIPL-1876:`), or `WIP:`, or `SPIKE:`. See `references/prefix-rules.md`.
3. **Body**: WHY this change was needed → WHAT it does at intent level → SHORT-TERM DECISIONS and ROADS NOT TAKEN. See `references/phrasing-guide.md`.
4. **No ephemeral IDs**: Never include bead IDs (`bd-...`), claim IDs (`AC-1`, `MOCK-001`), `[Implements bd-...]` blocks, `Bead:` or `Claim:` trailers, or sprint tags. Describe the *behavior*, not the tracking ID.
5. **Alternatives as evolution**: Frame roads not taken as "choice → why-now → future seam", never bare negation ("didn't use X").
6. **Durable trailers only**: `Co-Authored-By:` is fine (records who made the change). Tracking-state trailers are not.

## Finding the Ticket

1. Branch name — extract `[A-Z][A-Z0-9]+-\d+` from it.
2. The conversation — the user may have stated it.
3. Ask — "What ticket is this against?"

Never fabricate a key.

## Reference Files

- `references/prefix-rules.md` — the three prefix types and when to use each
- `references/phrasing-guide.md` — voice, WHY-over-what, evolution framing, scrub list
- `references/examples.md` — full before/after examples across scenarios
- `references/commit-message.txt` — template for `git config commit.template`
