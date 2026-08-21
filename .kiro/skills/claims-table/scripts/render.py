#!/usr/bin/env python3
"""
render.py — Renders claims.json into human-readable markdown and (optionally)
Gherkin .feature scaffolding.

Usage:
    python render.py <claims.json>                                  # Markdown only
    python render.py <claims.json> --gherkin                        # +Gherkin scaffold
    python render.py <claims.json> --md-out path.md --feature-out path.feature

The Gherkin output is a starting scaffold, not a finished test. Step
definitions are not generated; that's the test author's job.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------


def render_markdown(claims_obj: dict[str, Any]) -> str:
    component = claims_obj.get("component_name", "unknown")
    doc_path = claims_obj.get("doc_path", "(unknown)")
    generated = claims_obj.get("generated_at", "")
    summary = claims_obj.get("summary", {})
    by_kind = summary.get("by_kind", {})
    by_conf = summary.get("by_confidence", {})

    out: list[str] = []
    out.append(f"# Claims: {component}")
    out.append("")
    out.append(f"**Source:** `{doc_path}`")
    out.append(f"**Generated:** {generated}")
    out.append("")
    out.append("## Summary")
    out.append("")
    total = summary.get("total", len(claims_obj.get("claims", [])))
    out.append(f"- **Total claims:** {total}")
    if by_kind:
        kinds_str = ", ".join(f"{k}={v}" for k, v in sorted(by_kind.items()))
        out.append(f"- **By kind:** {kinds_str}")
    if by_conf:
        conf_str = ", ".join(f"{k}={v}" for k, v in sorted(by_conf.items()))
        out.append(f"- **By confidence:** {conf_str}")
    out.append("")
    out.append("## Claims")
    out.append("")
    out.append("| ID | Claim | Kind | Confidence | Test Anchor | Drift Anchor |")
    out.append("| --- | --- | --- | --- | --- | --- |")
    for c in claims_obj.get("claims", []):
        ac_id = c.get("id", "")
        claim = (c.get("claim") or "").replace("|", r"\|")
        kind = c.get("kind", "")
        confidence = c.get("confidence", "")
        test_anchor = c.get("test_anchor") or "—"
        drift_anchor = c.get("drift_anchor") or "—"
        out.append(f"| {ac_id} | {claim} | {kind} | {confidence} | `{test_anchor}` | `{drift_anchor}` |")

    # Surface any hedged or non-EARS claims for reviewer attention
    flagged = [c for c in claims_obj.get("claims", []) if c.get("ears_pattern") is None]
    if flagged:
        out.append("")
        out.append("## Flagged for review")
        out.append("")
        out.append("Claims that did not match a canonical EARS pattern:")
        out.append("")
        for c in flagged:
            out.append(f"- **{c.get('id')}** — {c.get('claim')}")

    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# Gherkin rendering
# ---------------------------------------------------------------------------


# EARS-to-Gherkin mappers. Each returns (Given, When, Then) — any of which can be None.
EARS_MAPPERS = {
    "ubiquitous":        re.compile(r"^The\s+(?P<system>\S.+?)\s+shall\s+(?P<response>\S.+)\.$"),
    "event-driven":      re.compile(r"^When\s+(?P<trigger>\S.+?),\s+the\s+(?P<system>\S.+?)\s+shall\s+(?P<response>\S.+)\.$"),
    "state-driven":      re.compile(r"^While\s+(?P<state>\S.+?),\s+the\s+(?P<system>\S.+?)\s+shall\s+(?P<response>\S.+)\.$"),
    "optional-feature":  re.compile(r"^Where\s+(?P<feature>\S.+?),\s+the\s+(?P<system>\S.+?)\s+shall\s+(?P<response>\S.+)\.$"),
    "unwanted-behavior": re.compile(r"^If\s+(?P<trigger>\S.+?),\s+then\s+the\s+(?P<system>\S.+?)\s+shall\s+(?P<response>\S.+)\.$"),
}


def claim_to_gherkin(claim: str, pattern: str | None) -> tuple[str, str | None, str, str]:
    """Return (scenario_title, given, when, then) for a single claim."""
    pattern = pattern or "ubiquitous"
    matcher = EARS_MAPPERS.get(pattern)
    if matcher is None:
        return (claim[:60], None, "the conditions of the claim hold", claim)
    m = matcher.match(claim)
    if not m:
        return (claim[:60], None, "the conditions of the claim hold", claim)
    parts = m.groupdict()
    system = parts.get("system", "system")
    response = parts.get("response", "the expected response occurs")
    if pattern == "ubiquitous":
        return (
            f"{system} {response}",
            f"the {system} is operating normally",
            "an operation is performed",
            f"the {system} {response}",
        )
    if pattern == "event-driven":
        return (
            parts["trigger"][:60],
            "the system is in the relevant state",
            parts["trigger"],
            f"the {system} {response}",
        )
    if pattern == "state-driven":
        return (
            f"during {parts['state']}",
            f"the system is in state: {parts['state']}",
            "an operation is performed",
            f"the {system} {response}",
        )
    if pattern == "optional-feature":
        return (
            f"with {parts['feature']}",
            f"{parts['feature']} is enabled",
            "an operation is performed",
            f"the {system} {response}",
        )
    if pattern == "unwanted-behavior":
        return (
            f"on error: {parts['trigger']}",
            "the system is in the relevant state",
            parts["trigger"],
            f"the {system} {response}",
        )
    return (claim[:60], None, "the conditions of the claim hold", claim)


def render_gherkin(claims_obj: dict[str, Any]) -> str:
    component = claims_obj.get("component_name", "unknown")
    out: list[str] = []
    out.append(f"Feature: {component}")
    out.append(f"  Acceptance criteria for the {component} component, derived from {claims_obj.get('doc_path', '(unknown)')}.")
    out.append("")
    for c in claims_obj.get("claims", []):
        ac_id = c.get("id", "")
        claim = c.get("claim", "")
        pattern = c.get("ears_pattern")
        title, given, when, then = claim_to_gherkin(claim, pattern)
        out.append(f"  # {ac_id}: {claim}")
        out.append(f"  Scenario: {ac_id} — {title}")
        if given:
            out.append(f"    Given {given}")
        out.append(f"    When {when}")
        out.append(f"    Then {then}")
        out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("claims_json", help="Path to claims.json")
    parser.add_argument("--md-out", help="Output path for markdown (default: alongside claims.json)")
    parser.add_argument("--feature-out", help="Output path for Gherkin .feature")
    parser.add_argument("--gherkin", action="store_true", help="Also render Gherkin scaffold")
    args = parser.parse_args()

    src = Path(args.claims_json)
    if not src.exists():
        print(f"error: file not found: {src}", file=sys.stderr)
        return 2
    obj = json.loads(src.read_text(encoding="utf-8"))

    md_path = Path(args.md_out) if args.md_out else src.with_suffix(".md")
    md_path.write_text(render_markdown(obj), encoding="utf-8")
    print(f"wrote {md_path}")

    if args.gherkin:
        feature_path = Path(args.feature_out) if args.feature_out else src.with_suffix(".feature")
        feature_path.write_text(render_gherkin(obj), encoding="utf-8")
        print(f"wrote {feature_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
