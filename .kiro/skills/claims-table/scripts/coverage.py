#!/usr/bin/env python3
"""
coverage.py — Cross-checks a claims.json against a repository to surface
gaps that would silently weaken the design.

Reports:
  - Pending anchors (drift_anchor or test_anchor == "pending")
  - Stale Drift anchors (path doesn't exist in repo)
  - Stale test anchors (path doesn't exist in repo)
  - Confidence vs. evidence mismatch (e.g., 'tested' but test_anchor doesn't resolve)
  - Bare counts: claims without tests, claims without code

Usage:
    python coverage.py <claims.json>                              # default repo root = cwd
    python coverage.py <claims.json> --repo-root /path/to/repo
    python coverage.py <claims.json> --json                       # machine-readable output

Exit codes:
    0  - no issues
    1  - one or more issues that warrant attention (still informational)
    2  - input error
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any


@dataclass
class Issue:
    severity: str  # "info" | "warning" | "error"
    claim_id: str
    message: str

    def __str__(self) -> str:
        return f"[{self.severity:7}] {self.claim_id}: {self.message}"


@dataclass
class Report:
    issues: list[Issue] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)

    def add(self, severity: str, claim_id: str, message: str) -> None:
        self.issues.append(Issue(severity=severity, claim_id=claim_id, message=message))

    def to_dict(self) -> dict:
        return {
            "issues": [asdict(i) for i in self.issues],
            "counts": dict(self.counts),
        }


def split_anchor(anchor: str | None) -> tuple[str, str] | None:
    """Split path[::|#]name into (path, name). None if anchor is missing/pending/malformed."""
    if not anchor or anchor == "pending":
        return None
    sep = "::" if "::" in anchor else ("#" if "#" in anchor else None)
    if sep is None:
        return None
    path, name = anchor.split(sep, 1)
    return path, name


def analyze(claims_obj: dict[str, Any], repo_root: Path) -> Report:
    report = Report()
    claims = claims_obj.get("claims", [])

    # Counters
    pending_drift = 0
    pending_test = 0
    stale_drift = 0
    stale_test = 0
    by_conf = {"verified": 0, "tested": 0, "asserted": 0, "assumed": 0, "speculative": 0}
    drift_targets: dict[str, list[str]] = {}
    test_targets: dict[str, list[str]] = {}

    for c in claims:
        cid = c.get("id", "?")
        confidence = c.get("confidence", "")
        if confidence in by_conf:
            by_conf[confidence] += 1

        # Drift anchor analysis
        drift_anchor = c.get("drift_anchor")
        if not drift_anchor or drift_anchor == "pending":
            pending_drift += 1
            report.add("info", cid, "drift_anchor is pending — no implementation yet")
        else:
            parts = split_anchor(drift_anchor)
            if parts is None:
                report.add("error", cid, f"drift_anchor is malformed: {drift_anchor!r}")
            else:
                path, _name = parts
                if not (repo_root / path).is_file():
                    stale_drift += 1
                    report.add("warning", cid, f"drift_anchor stale — file does not exist: {path}")
                drift_targets.setdefault(drift_anchor, []).append(cid)

        # Test anchor analysis
        test_anchor = c.get("test_anchor")
        if not test_anchor or test_anchor == "pending":
            pending_test += 1
            report.add("info", cid, "test_anchor is pending — no test yet")
        else:
            parts = split_anchor(test_anchor)
            if parts is None:
                report.add("error", cid, f"test_anchor is malformed: {test_anchor!r}")
            else:
                path, _name = parts
                if not (repo_root / path).is_file():
                    stale_test += 1
                    report.add("warning", cid, f"test_anchor stale — file does not exist: {path}")
                test_targets.setdefault(test_anchor, []).append(cid)

        # Confidence vs. evidence checks
        if confidence == "tested" and (not test_anchor or test_anchor == "pending"):
            report.add("warning", cid, "confidence is 'tested' but test_anchor is pending — confidence inflated")
        if confidence == "tested":
            parts = split_anchor(test_anchor) if test_anchor else None
            if parts and not (repo_root / parts[0]).is_file():
                report.add("warning", cid, f"confidence is 'tested' but test file does not exist")
        if confidence in {"asserted", "tested", "verified"} and (not drift_anchor or drift_anchor == "pending"):
            report.add("warning", cid, f"confidence is '{confidence}' but drift_anchor is pending — promote with care")
        if confidence == "verified" and not c.get("verification_evidence"):
            report.add("warning", cid, "confidence is 'verified' but no verification_evidence is recorded")

    # Roll-up counts
    report.counts["total_claims"] = len(claims)
    report.counts["pending_drift_anchors"] = pending_drift
    report.counts["pending_test_anchors"] = pending_test
    report.counts["stale_drift_anchors"] = stale_drift
    report.counts["stale_test_anchors"] = stale_test
    for k, v in by_conf.items():
        report.counts[f"confidence_{k}"] = v

    # Multi-claim drift anchors are common (one symbol satisfies many claims) — informational
    multi_drift = {k: v for k, v in drift_targets.items() if len(v) > 1}
    if multi_drift:
        for anchor, ids in multi_drift.items():
            report.add("info", ",".join(ids), f"shared drift_anchor: {anchor}")

    return report


def render_human(report: Report) -> str:
    lines = []
    lines.append("Coverage report")
    lines.append("===============")
    lines.append("")
    lines.append("Counts:")
    for k, v in sorted(report.counts.items()):
        lines.append(f"  {k:32}  {v}")
    lines.append("")
    if report.issues:
        lines.append("Issues:")
        # Sort: errors → warnings → info
        order = {"error": 0, "warning": 1, "info": 2}
        for issue in sorted(report.issues, key=lambda i: (order.get(i.severity, 99), i.claim_id)):
            lines.append(f"  {issue}")
    else:
        lines.append("No issues.")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("claims_json")
    parser.add_argument("--repo-root", default=".", help="Root of the repository (default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of human-readable text")
    args = parser.parse_args()

    src = Path(args.claims_json)
    if not src.exists():
        print(f"error: file not found: {src}", file=sys.stderr)
        return 2
    obj = json.loads(src.read_text(encoding="utf-8"))

    repo_root = Path(args.repo_root).resolve()
    report = analyze(obj, repo_root)

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(render_human(report))

    has_warnings_or_errors = any(i.severity in {"warning", "error"} for i in report.issues)
    return 1 if has_warnings_or_errors else 0


if __name__ == "__main__":
    sys.exit(main())
