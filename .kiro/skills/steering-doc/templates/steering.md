---
package: <path/from/repo/root>
owns: "<one sentence, no 'and' joining two responsibilities>"
read_when:
  - "<trigger phrase — how an agent decides this doc is relevant>"
  - "<another>"
claims: [<PREFIX>-001]
covers:
  - <path/from/repo/root/File.ext>#<Symbol>
adrs: []
status: provisional
last_harvest:
---

# <Package name>

## What this package owns

<1–3 sentences. The responsibility, and where it stops. A reader should be able to tell from this
paragraph alone whether the thing they are looking for lives here.>

## Must know before you touch this

<Bulleted. The MUST-KNOW context for changing code in this package: non-obvious invariants, ordering
constraints, the assumption that will bite someone who reads only the code.

Test for every bullet: could a competent reader work this out in 30 seconds by opening the file? If
yes, delete it — you have created something that can go stale for no benefit.>

- <invariant or constraint>
- <the thing that bites people>

## Claims

| ID | Claim | Anchor | Status |
|----|-------|--------|--------|
| <PREFIX>-001 | When <trigger>, <component> shall <response> | File.ext#Symbol | unverified |

## Code anchors

@./<path/from/repo/root/File.ext>#<Symbol>

## Boundaries

- **Must not**: <what this package is forbidden from doing>
- **Callers**: <who is allowed to depend on this>
- **Depends on**: <what this may import; what it may not>

## Where decisions live

- ADR <NNNN> — <one-line decision>
