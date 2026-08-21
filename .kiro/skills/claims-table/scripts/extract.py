#!/usr/bin/env python3
"""
extract.py — Extracts a claims.json artifact from a design document's
Acceptance Criteria section.

Usage:
    python extract.py <design-doc.md>
    python extract.py <design-doc.md> --out design/.claims/<name>.claims.json
    python extract.py <design-doc.md> --repo-root . --resolve-anchors

Behavior:
    - Locates the Acceptance Criteria section in the source doc.
    - Parses the markdown table within that section.
    - Validates each row: AC-N id, EARS-form claim, valid kind, valid confidence.
    - If --resolve-anchors is set, checks whether the test_anchor and
      drift_anchor point to real files in the repo, and computes default
      confidence accordingly.
    - Emits claims.json that validates against schemas/claims.schema.json.

Exit codes:
    0  - extraction succeeded
    1  - extraction failed (validation errors)
    2  - input file not found / unreadable
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Constants & patterns
# ---------------------------------------------------------------------------

CONFIDENCE_VALUES = {"verified", "tested", "asserted", "assumed", "speculative"}
KIND_VALUES = {"precondition", "postcondition", "invariant", "perf", "security", "ux"}

EARS_RECOGNIZERS: list[tuple[str, re.Pattern[str]]] = [
    ("ubiquitous",       re.compile(r"^The\s+\S.+?\s+shall\s+\S.+\.$")),
    ("event-driven",     re.compile(r"^When\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$")),
    ("state-driven",     re.compile(r"^While\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$")),
    ("optional-feature", re.compile(r"^Where\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$")),
    ("unwanted-behavior", re.compile(r"^If\s+\S.+?,\s+then\s+the\s+\S.+?\s+shall\s+\S.+\.$")),
    ("composed",         re.compile(r"^(While|Where)\s+\S.+?\s+and\s+when\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$")),
]

HEDGE_WORDS = re.compile(r"\b(probably|typically|generally|usually|might|may|should\s+ideally)\b", re.IGNORECASE)

H1_RE = re.compile(r"^#\s+Design:\s*(.+?)\s*$", re.MULTILINE)
HEADER_RE = re.compile(r"^(#+)\s*(.+?)\s*$")


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Claim:
    id: str
    claim: str
    kind: str
    confidence: str
    ears_pattern: Optional[str] = None
    test_anchor: Optional[str] = None
    drift_anchor: Optional[str] = None
    rationale: Optional[str] = None
    owner: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    verification_evidence: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        # Drop None and empty list values for cleaner JSON
        return {k: v for k, v in d.items() if v not in (None, [], "")}


@dataclass
class ExtractionError(Exception):
    line: int
    message: str

    def __str__(self) -> str:
        return f"L{self.line}: {self.message}"


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def find_h1(text: str) -> str:
    match = H1_RE.search(text)
    if match:
        return match.group(1).strip()
    # Fallback: first H1 of any kind
    for line in text.splitlines():
        m = re.match(r"^#\s+(.+?)\s*$", line)
        if m:
            return m.group(1).strip()
    return "unknown-component"


def find_section(lines: list[str], section_name: str) -> tuple[int, int] | None:
    """Return (start, end) 0-indexed line bounds of a section's body."""
    start = None
    section_level = None
    for i, line in enumerate(lines):
        m = HEADER_RE.match(line.lstrip())
        if not m:
            continue
        level = len(m.group(1))
        text = m.group(2)
        if start is None and section_name.lower() in text.lower():
            start = i + 1
            section_level = level
        elif start is not None and level <= (section_level or 1):
            return (start, i)
    if start is not None:
        return (start, len(lines))
    return None


def parse_table(lines: list[str], section_start: int) -> list[tuple[int, list[str]]]:
    """Parse a markdown table starting in the given section. Returns (line_num, cells) tuples."""
    rows: list[tuple[int, list[str]]] = []
    state = "before_header"  # before_header → after_header_separator → reading_rows
    for offset, line in enumerate(lines):
        absolute = section_start + offset + 1  # 1-indexed line numbers
        stripped = line.strip()
        if not stripped.startswith("|"):
            if state == "reading_rows":
                # Hit non-table content — table has ended
                break
            continue
        if re.match(r"^\|[-\s|:]+\|$", stripped):
            state = "after_header_separator"
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if state == "before_header":
            state = "before_header"  # waiting for separator
            continue
        if state == "after_header_separator":
            state = "reading_rows"
        rows.append((absolute, cells))
    return rows


def detect_ears(claim_text: str) -> str | None:
    for name, pattern in EARS_RECOGNIZERS:
        if pattern.match(claim_text):
            return name
    return None


def has_hedges(claim_text: str) -> bool:
    return bool(HEDGE_WORDS.search(claim_text))


# ---------------------------------------------------------------------------
# Anchor resolution
# ---------------------------------------------------------------------------


def resolve_drift_anchor(anchor: str, repo_root: Path) -> bool:
    """Return True if the drift anchor's path resolves to an existing file."""
    if anchor == "pending":
        return False
    if "#" not in anchor:
        return False
    path = anchor.split("#", 1)[0]
    return (repo_root / path).is_file()


def resolve_test_anchor(anchor: str, repo_root: Path) -> bool:
    """Return True if the test anchor's path resolves to an existing file. Doesn't run the test."""
    if anchor == "pending":
        return False
    # Accept both pytest (path::name) and symbol-style (path#name)
    sep = "::" if "::" in anchor else "#"
    if sep not in anchor:
        return False
    path = anchor.split(sep, 1)[0]
    return (repo_root / path).is_file()


def default_confidence(test_resolves: bool, drift_resolves: bool, has_hedges_flag: bool) -> str:
    if has_hedges_flag:
        return "speculative"
    if not drift_resolves:
        return "assumed"
    if test_resolves:
        return "tested"
    return "asserted"


# ---------------------------------------------------------------------------
# Validation & extraction
# ---------------------------------------------------------------------------


def extract_claim_from_row(line_num: int, cells: list[str]) -> Claim:
    if len(cells) < 4:
        raise ExtractionError(line_num, f"Row has fewer than 4 columns: {cells!r}")
    ac_id = cells[0]
    claim_text = cells[1]
    kind = cells[2].lower()
    confidence = cells[3].lower()
    test_anchor = cells[4] if len(cells) > 4 and cells[4] else None
    drift_anchor = cells[5] if len(cells) > 5 and cells[5] else None

    if not re.match(r"^AC-\d+$", ac_id):
        raise ExtractionError(line_num, f"ID must match 'AC-N': got {ac_id!r}")
    if kind not in KIND_VALUES:
        raise ExtractionError(line_num, f"Unknown kind {kind!r}; allowed: {sorted(KIND_VALUES)}")
    if confidence not in CONFIDENCE_VALUES:
        raise ExtractionError(line_num, f"Unknown confidence {confidence!r}; allowed: {sorted(CONFIDENCE_VALUES)}")

    ears = detect_ears(claim_text)
    if ears is None:
        # Don't hard-fail on EARS — surface as warning. The caller decides.
        ears = None

    return Claim(
        id=ac_id,
        claim=claim_text,
        kind=kind,
        confidence=confidence,
        ears_pattern=ears,
        test_anchor=test_anchor,
        drift_anchor=drift_anchor,
    )


def extract(doc_path: Path, repo_root: Path, resolve_anchors: bool, recompute_confidence: bool) -> dict:
    text = doc_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    component_name = find_h1(text)

    span = find_section(lines, "Acceptance Criteria")
    if span is None:
        raise SystemExit("error: no 'Acceptance Criteria' section found in source doc")
    start, end = span
    section_lines = lines[start:end]
    rows = parse_table(section_lines, start)

    if not rows:
        raise SystemExit("error: Acceptance Criteria section has no parseable table")

    claims: list[Claim] = []
    errors: list[ExtractionError] = []
    warnings: list[str] = []

    for line_num, cells in rows:
        try:
            claim = extract_claim_from_row(line_num, cells)
        except ExtractionError as e:
            errors.append(e)
            continue

        if claim.ears_pattern is None:
            warnings.append(f"L{line_num}: Claim '{claim.id}' is not in EARS form — flagging but extracted")

        # Optional anchor resolution and confidence recomputation
        if resolve_anchors:
            test_ok = bool(claim.test_anchor) and resolve_test_anchor(claim.test_anchor, repo_root)
            drift_ok = bool(claim.drift_anchor) and resolve_drift_anchor(claim.drift_anchor, repo_root)
            if claim.test_anchor and claim.test_anchor != "pending" and not test_ok:
                warnings.append(f"L{line_num}: {claim.id} test_anchor doesn't resolve to a file: {claim.test_anchor}")
            if claim.drift_anchor and claim.drift_anchor != "pending" and not drift_ok:
                warnings.append(f"L{line_num}: {claim.id} drift_anchor doesn't resolve to a file: {claim.drift_anchor}")
            if recompute_confidence:
                hedges = has_hedges(claim.claim)
                inferred = default_confidence(test_ok, drift_ok, hedges)
                if inferred != claim.confidence:
                    warnings.append(
                        f"L{line_num}: {claim.id} confidence in doc is '{claim.confidence}' but rubric suggests '{inferred}' — "
                        f"keeping doc value (use --apply-rubric to override)"
                    )
        claims.append(claim)

    if errors:
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        raise SystemExit(1)

    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)

    by_kind = Counter(c.kind for c in claims)
    by_confidence = Counter(c.confidence for c in claims)

    out = {
        "component_name": component_name,
        "doc_path": str(doc_path).replace("\\", "/"),
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "summary": {
            "total": len(claims),
            "by_kind": dict(by_kind),
            "by_confidence": dict(by_confidence),
        },
        "claims": [c.to_dict() for c in claims],
    }
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("doc", help="Path to the design doc (.md)")
    parser.add_argument("--out", help="Output path for claims.json (default: design/.claims/<name>.claims.json)")
    parser.add_argument("--repo-root", default=".", help="Repo root for anchor resolution (default: cwd)")
    parser.add_argument("--resolve-anchors", action="store_true",
                        help="Check whether test_anchor and drift_anchor paths exist in repo")
    parser.add_argument("--apply-rubric", action="store_true",
                        help="Recompute confidence from the rubric and override doc value (requires --resolve-anchors)")
    args = parser.parse_args()

    doc_path = Path(args.doc)
    if not doc_path.exists():
        print(f"error: file not found: {doc_path}", file=sys.stderr)
        return 2

    repo_root = Path(args.repo_root).resolve()
    out_obj = extract(
        doc_path=doc_path,
        repo_root=repo_root,
        resolve_anchors=args.resolve_anchors,
        recompute_confidence=args.apply_rubric and args.resolve_anchors,
    )

    if args.out:
        out_path = Path(args.out)
    else:
        stem = doc_path.stem
        out_path = doc_path.parent / ".claims" / f"{stem}.claims.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out_obj, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out_path} ({out_obj['summary']['total']} claims)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
