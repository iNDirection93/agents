#!/usr/bin/env bash
# link-steering.sh [--dry-run] [--all|--package DIR] [<doc>...]
#
# Projects a steering doc's frontmatter `covers:` list into drift.lock by running
# `drift link <doc> <target>` for each entry.
#
# `covers:` is the representation agents read and edit; drift.lock is the one CI
# enforces. This script is the only thing that should write the second from the
# first — never hand-edit drift.lock.
#
# Only Bart (at harvest) and Dr. Nick (for docs he just wrote) run this. Stamping
# an anchor asserts "I looked, and the doc is still true" — that is a judgement.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"

die() { printf 'drift-anchors: %s\n' "$*" >&2; exit 2; }

DRY=0; SWEEP=0; DOCS=()
while [ $# -gt 0 ]; do
  case $1 in
    --dry-run) DRY=1; shift ;;
    --all)     SWEEP=1; shift
               while IFS= read -r d; do DOCS+=("$d"); done < <(
                 find "$ROOT" -type d -name .git -prune -o -type d -name .steering -print0 2>/dev/null |
                 xargs -0 -I{} find {} -name '*.md' -type f 2>/dev/null | sort) ;;
    --package) SWEEP=1; DIR=${2:?--package needs a directory}; shift 2
               while IFS= read -r d; do DOCS+=("$d"); done < <(
                 find "$DIR/.steering" -name '*.md' -type f 2>/dev/null | sort) ;;
    *) DOCS+=("$1"); shift ;;
  esac
done
# A sweep (--all / --package) over an empty set is a legitimate state, not an error:
# during bootstrap no package has steering yet, and CI sweeps run before the first
# doc lands. An explicit path that yields nothing IS an error — the caller named
# something they expected to exist.
if [ ${#DOCS[@]} -eq 0 ]; then
  [ "$SWEEP" = 1 ] || die "nothing to link. Pass a doc, --package DIR, or --all"
  printf 'no steering docs found — nothing to link\n'
  exit 0
fi

if ! command -v drift >/dev/null 2>&1; then
  if [ "$DRY" = 0 ]; then
    die "drift is not installed.
  brew install fiberplane/tap/drift
  # or: curl -fsSL https://drift.fp.dev/install.sh | sh
Re-run with --dry-run to see the commands without executing them."
  fi
  printf 'note: drift not installed — printing commands only\n\n' >&2
fi

# Extract the frontmatter `covers:` block-list from a markdown file.
covers_of() {
  awk '
    NR==1 && $0=="---" { infm=1; next }
    infm && $0=="---"  { exit }
    infm && /^covers:[[:space:]]*$/ { incov=1; next }
    infm && incov && /^[[:space:]]*-[[:space:]]*/ {
      line=$0; sub(/^[[:space:]]*-[[:space:]]*/,"",line)
      gsub(/^["'"'"']|["'"'"']$/,"",line); gsub(/^@\.\//,"",line)
      print line; next
    }
    infm && incov && /^[^[:space:]]/ { incov=0 }
  ' "$1"
}

RC=0
for DOC in "${DOCS[@]}"; do
  [ -f "$DOC" ] || { printf 'MISS  %s (no such file)\n' "$DOC"; RC=1; continue; }
  REL=${DOC#"$ROOT"/}
  N=0
  while IFS= read -r TARGET; do
    [ -n "$TARGET" ] || continue
    N=$((N + 1))
    FILE=${TARGET%%#*}
    if [ ! -f "$ROOT/$FILE" ]; then
      # Greenfield: the symbol is designed but not built yet. Not an error —
      # the doc should be status: provisional and Bart links it after the code lands.
      printf 'SKIP  %s -> %s (file does not exist yet)\n' "$REL" "$TARGET"
      continue
    fi
    if [ "$DRY" = 1 ] || ! command -v drift >/dev/null 2>&1; then
      printf 'would: drift link %s %s\n' "$REL" "$TARGET"
    elif (cd "$ROOT" && drift link "$REL" "$TARGET" >/dev/null 2>&1); then
      printf 'LINK  %s -> %s\n' "$REL" "$TARGET"
    else
      printf 'FAIL  %s -> %s (drift link failed — does the symbol exist?)\n' "$REL" "$TARGET"
      RC=1
    fi
  done < <(covers_of "$DOC")
  [ "$N" -gt 0 ] || printf 'EMPTY %s (no covers: entries — nothing binds this doc to code)\n' "$REL"
done
exit $RC
