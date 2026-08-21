---
name: drift-anchors
description: Binds package steering docs to the code they describe using fiberplane/drift, so a code change that outruns its documentation fails CI. Use when a steering doc's covers list needs projecting into drift.lock, when drift check reports a stale anchor and someone must decide whether to re-stamp or rewrite the doc, when new symbols have landed for a provisional steering doc, or when setting up the CI gate. Provides link-steering.sh and the GitLab CI job. Do not use to hand-edit drift.lock, and do not run it as Flanders — re-stamping is a judgement that belongs to Bart at harvest.
---

# drift-anchors

[Drift](https://github.com/fiberplane/drift) fingerprints the AST of a file or symbol and stores the
signature next to the doc that describes it. When the code changes and the doc doesn't, `drift check`
fails. Java and Go are both supported, so it covers this repo end to end.

Without a mechanism like this, package steering rots exactly like the monolithic design docs it
replaced — just in more places.

## Two representations, one direction of flow

```
   <pkg>/.steering/x.md                       drift.lock (repo root, TOML)
   ────────────────────                       ─────────────────────────────
   covers:                    link-steering   [[bindings]]
     - path/File.java#Symbol  ───────────►    doc = "<pkg>/.steering/x.md"
   ## Code anchors                            target = "path/File.java#Symbol"
   @./path/File.java#Symbol                   sig = "e4f8a2c10b3d7890"
```

`covers:` is what agents read and edit. `drift.lock` is what CI enforces. **Never hand-edit
`drift.lock`** — it holds content signatures, and a hand-written one is a lie about having looked.

## Linking

```bash
L=.kiro/skills/drift-anchors/link-steering.sh

$L <pkg>/.steering/transport.md      # one doc
$L --package <pkg>                   # every steering doc in a package
$L --all                             # the whole repo
$L --dry-run --all                   # print the drift commands, change nothing
```

`SKIP … (file does not exist yet)` is expected for greenfield steering: the doc was written before
the code. Leave it `status: provisional` and let Bart link it once the symbols land — `drift link`
against a missing file just fails.

Not installed? `brew install fiberplane/tap/drift`, or
`curl -fsSL https://drift.fp.dev/install.sh | sh`. `--dry-run` works without it.

## Checking

```bash
drift check                                  # everything
drift check --changed gateway/mcpServer      # scoped — what CI runs on an MR
drift refs gateway/mcpServer/internal/transport/http.go   # which docs cover this file?
drift status                                 # every binding in the lockfile
```

`drift refs` is the one to reach for **before** editing a file: it answers "whose documentation am I
about to invalidate?" in one command.

## Who may re-stamp

`drift link` asserts *"I looked, and the doc is still true."* That is a judgement, so it is not
available to everyone:

| Agent | May re-stamp? | Why |
|---|---|---|
| **Bart** (harvest) | yes | it is his job — he has the diff, the close reasons, and the doc in front of him |
| **Dr. Nick** | yes, for docs he just wrote | he is the author; the assertion is his to make |
| **Flanders** | **no** | he records `drift check --changed` in the close reason and moves on |
| Willie, Lisa, Tod, todbots | no | — |

So CI is red between "code landed" and "harvest ran". That is the design, not a bug: it is the
mechanism that makes the harvest non-optional. A world where the implementer re-stamps his own
anchors is a world where the docs are decorative.

At harvest, each stale anchor gets one of three outcomes:

| Finding | Action |
|---|---|
| doc still accurate, symbol just moved or was reformatted | re-stamp |
| doc's claim is now false | leave stale, bead for Dr. Nick |
| symbol is gone | remove from `covers:`, bead for Dr. Nick if the doc still references it |

## Anchor discipline

- **Prefer symbol anchors** (`File.java#ClassName`) over file anchors. A file anchor goes stale on
  every unrelated edit, and an anchor that cries wolf teaches people to re-stamp without reading —
  which is worse than having no anchor at all.
- **Anchor contracts, not tutorials.** The interface, the SPI, the key type. Not the illustrative
  example — that changes whenever someone improves the example.
- **One anchor per symbol.** If a doc covers three symbols, that's three `covers:` entries.
- **Keep `covers:` and the *Code anchors* section in sync.** `validate.py` warns when an inline
  anchor isn't in `covers:`, because only `covers:` gets projected.

## CI

The repo is GitLab, so the job lives in `.gitlab-ci.yml` (drift's README shows a GitHub Action —
different platform, same two commands). Copy `drift.gitlab-ci.yml` from `.kiro/ci/` and include it:

```yaml
include:
  - local: '.kiro/ci/drift.gitlab-ci.yml'
```

The job runs `drift check --changed` against the files the MR touched, so it stays fast and only
complains about docs this change could have invalidated.

**Introduce it non-blocking.** Run with `allow_failure: true` until the packages you care about are
actually linked; a gate that fires on day one for docs nobody has bound yet gets disabled in a week
and never comes back.

## Cross-repo docs

If a doc travels between repos (an installed skill, a vendored template), give its bindings an
`origin` field so `drift check` skips them outside their home repo instead of reporting a false "file
not found". Not needed for anything in this module today.
