#!/usr/bin/env python3
"""
validate.py — Lints a design doc produced by the frink-design-doc skill.

Checks:
  - Required sections present (template-aware: minimal vs full)
  - Drift anchor syntax (path, symbol, placement)
  - Acceptance Criteria table shape and EARS form
  - Confidence values from the rubric
  - Changelog has at least one entry

Usage:
    python validate.py <path-to-design-doc.md>
    python validate.py --template minimal <path>
    python validate.py --template full <path>
    python validate.py --template adr <path>

Exits non-zero on any failure.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CONFIDENCE_VALUES = {"verified", "tested", "asserted", "assumed", "speculative"}
KIND_VALUES = {"precondition", "postcondition", "invariant", "perf", "security", "ux"}

REQUIRED_SECTIONS = {
    "minimal": [
        "Problem & Context",
        "Goals",
        "Non-goals",
        "Solution Overview",
        "Detailed Design",
        "SPIs Between Components",
        "Data Flow",
        "Decisions",
        "Risks & Open Questions",
        "Acceptance Criteria",
        "Changelog",
    ],
    "full": [
        "Introduction & Goals",
        "Constraints",
        "Context & Scope",
        "Solution Strategy",
        "Building Blocks",
        "SPIs Between Components",
        "Runtime View",
        "Crosscutting Concerns",
        "Decisions",
        "Quality Requirements",
        "Risks & Open Questions",
        "Acceptance Criteria",
        "Changelog",
    ],
    "adr": [
        "Y-Statement",
        "Context",
        "Considered Options",
        "Decision",
        "Consequences",
    ],
}

# EARS pattern recognizers. The five canonical forms.
EARS_PATTERNS = [
    re.compile(r"^The\s+\S.+?\s+shall\s+\S.+\.$"),                       # ubiquitous
    re.compile(r"^When\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$"),        # event
    re.compile(r"^While\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$"),       # state
    re.compile(r"^Where\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$"),       # optional
    re.compile(r"^If\s+\S.+?,\s+then\s+the\s+\S.+?\s+shall\s+\S.+\.$"),   # unwanted
    # Composed: While ... and when ...
    re.compile(r"^While\s+\S.+?\s+and\s+when\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$"),
    re.compile(r"^Where\s+\S.+?\s+and\s+when\s+\S.+?,\s+the\s+\S.+?\s+shall\s+\S.+\.$"),
]

ANCHOR_RE = re.compile(r"<!--\s*@(\./[^\s#]+)(?:#([A-Za-z_][A-Za-z0-9_]*))?\s*-->")
INLINE_ANCHOR_RE = re.compile(r"^([^\s#]+)#([A-Za-z_][A-Za-z0-9_]*)$")  # for table column

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class Issue:
    severity: str  # "error" | "warning"
    line: int | None
    message: str

    def __str__(self) -> str:
        loc = f"L{self.line}" if self.line is not None else "—"
        return f"[{self.severity.upper():7}] {loc}: {self.message}"


@dataclass
class Result:
    issues: list[Issue] = field(default_factory=list)

    def add(self, severity: str, message: str, line: int | None = None) -> None:
        self.issues.append(Issue(severity=severity, line=line, message=message))

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]

    @property
    def ok(self) -> bool:
        return not self.errors


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def check_required_sections(lines: list[str], template: str, result: Result) -> None:
    required = REQUIRED_SECTIONS.get(template, REQUIRED_SECTIONS["minimal"])
    headers = [(i + 1, line.lstrip("#").strip()) for i, line in enumerate(lines) if line.lstrip().startswith("#")]
    header_texts = [h.lower() for _, h in headers]
    for needed in required:
        # Match permissively: section header just has to *contain* the needed phrase
        if not any(needed.lower() in h for h in header_texts):
            result.add("error", f"Required section missing: '{needed}'")


def check_drift_anchors(lines: list[str], result: Result) -> None:
    seen: dict[str, int] = {}
    for i, line in enumerate(lines, start=1):
        match = ANCHOR_RE.search(line)
        if not match:
            continue
        path, symbol = match.group(1), match.group(2)
        # Adjacency: next non-empty line should start a fenced code block
        next_idx = i  # 1-indexed; lines[i] is the line after `line`
        while next_idx < len(lines) and lines[next_idx].strip() == "":
            next_idx += 1
        if next_idx >= len(lines) or not lines[next_idx].lstrip().startswith("```"):
            result.add("error", f"Drift anchor not immediately above a fenced code block: {path}#{symbol or ''}", line=i)
        # Adjacency strict: NO blank line allowed between anchor and fence
        if next_idx > i:
            result.add("error", f"Drift anchor must be on the line immediately preceding the fence (no blank line): {path}#{symbol or ''}", line=i)
        if not symbol:
            result.add("warning", f"Drift anchor lacks a symbol — falls back to whole-file fingerprinting: {path}", line=i)
        # Duplicate detection
        key = f"{path}#{symbol or ''}"
        if key in seen:
            result.add("error", f"Duplicate Drift anchor in this doc: {key} (also on L{seen[key]})", line=i)
        else:
            seen[key] = i


def find_section(lines: list[str], section_name: str) -> tuple[int, int] | None:
    """Return (start, end) line indices (0-indexed) of a section's body, or None."""
    start = None
    section_level = None
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        if stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            text = stripped.lstrip("#").strip()
            if start is None and section_name.lower() in text.lower():
                start = i + 1
                section_level = level
            elif start is not None and level <= (section_level or 1):
                return (start, i)
    if start is not None:
        return (start, len(lines))
    return None


def check_acceptance_criteria(lines: list[str], result: Result) -> None:
    span = find_section(lines, "Acceptance Criteria")
    if span is None:
        return  # already reported by required-sections check
    start, end = span
    rows = []
    in_table = False
    for offset, line in enumerate(lines[start:end]):
        absolute = start + offset + 1  # 1-indexed
        if line.lstrip().startswith("|"):
            # Skip header separator rows like | --- | --- |
            if re.match(r"^\s*\|[-\s|:]+\|\s*$", line):
                in_table = True
                continue
            if not in_table:
                # Header row
                in_table = True
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append((absolute, cells))
    if not rows:
        result.add("error", "Acceptance Criteria section has no table rows.")
        return
    # Expected columns: ID, Claim, Kind, Confidence, Test Anchor, Drift Anchor
    for line_num, cells in rows:
        if len(cells) < 4:
            result.add("error", f"Acceptance Criteria row has fewer than 4 columns: {cells}", line=line_num)
            continue
        ac_id, claim, kind, confidence, *rest = cells
        if not re.match(r"^AC-\d+$", ac_id):
            result.add("error", f"Acceptance Criteria ID must match 'AC-N': got '{ac_id}'", line=line_num)
        if not any(p.match(claim) for p in EARS_PATTERNS):
            result.add("error", f"Claim is not in EARS form: '{claim[:80]}{'...' if len(claim) > 80 else ''}'", line=line_num)
        if kind.lower() not in KIND_VALUES:
            result.add("error", f"Unknown kind '{kind}'. Allowed: {sorted(KIND_VALUES)}", line=line_num)
        if confidence.lower() not in CONFIDENCE_VALUES:
            result.add("error", f"Unknown confidence '{confidence}'. Allowed: {sorted(CONFIDENCE_VALUES)}", line=line_num)
        # Test/Drift anchor cells are optional but if present should parse
        if len(rest) >= 1 and rest[0] and rest[0].lower() != "pending":
            test_anchor = rest[0]
            if "::" not in test_anchor and "#" not in test_anchor:
                result.add("warning", f"Test anchor doesn't look like 'path::name' or 'path#symbol': '{test_anchor}'", line=line_num)
        if len(rest) >= 2 and rest[1] and rest[1].lower() != "pending":
            drift_anchor = rest[1]
            if not INLINE_ANCHOR_RE.match(drift_anchor):
                result.add("warning", f"Drift anchor in table doesn't match 'path#Symbol': '{drift_anchor}'", line=line_num)


def check_changelog(lines: list[str], result: Result) -> None:
    span = find_section(lines, "Changelog")
    if span is None:
        return
    start, end = span
    has_entry = False
    for line in lines[start:end]:
        # A real entry has a date in YYYY-MM-DD form
        if re.search(r"\b\d{4}-\d{2}-\d{2}\b", line) and "YYYY-MM-DD" not in line:
            has_entry = True
            break
    if not has_entry:
        result.add("error", "Changelog has no dated entries (only template placeholders).")


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def detect_template(lines: list[str]) -> str:
    text = "\n".join(lines).lower()
    if "y-statement" in text and "considered options" in text:
        return "adr"
    if "introduction & goals" in text or "solution strategy" in text:
        return "full"
    return "minimal"


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="Path to the design doc to validate")
    parser.add_argument(
        "--template",
        choices=["minimal", "full", "adr", "auto"],
        default="auto",
        help="Which template's required sections to check against (default: auto-detect)",
    )
    args = parser.parse_args(argv)

    path = Path(args.path)
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 2

    lines = path.read_text(encoding="utf-8").splitlines()
    template = detect_template(lines) if args.template == "auto" else args.template

    result = Result()
    check_required_sections(lines, template, result)
    check_drift_anchors(lines, result)
    if template != "adr":
        check_acceptance_criteria(lines, result)
    check_changelog(lines, result)

    print(f"Validating {path} (template: {template})")
    print(f"  {len(result.errors)} error(s), {len(result.warnings)} warning(s)")
    print()
    for issue in result.issues:
        print(f"  {issue}")

    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
