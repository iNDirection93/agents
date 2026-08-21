#!/usr/bin/env python3
"""Validate package steering docs and ADRs against the knowledge-graph conventions.

    validate.py <path>...            # validate specific files
    validate.py --package <dir>      # validate a package's .steering/ and .design/adrs/
    validate.py --all                # walk the repo for .steering/*.md and .design/adrs/*.md
    validate.py --self-test          # validate the shipped templates (structure only)

Exit 0 when everything passes, 1 when any ERROR is found. WARNs never fail the run —
they are judgement calls, and a script does not get to make those.

No third-party dependencies: the frontmatter parser handles the small YAML subset the
conventions actually use (scalars, inline lists, and block lists).
"""

import os
import re
import sys

MAX_STEERING_LINES = 120
MAX_CODE_BLOCK_LINES = 10

STEERING_REQUIRED_FM = ["package", "owns", "read_when", "claims", "covers", "status"]
STEERING_STATUS = {"current", "provisional", "stale"}
STEERING_SECTIONS = [
    "What this package owns",
    "Must know before you touch this",
    "Claims",
    "Code anchors",
    "Boundaries",
    "Where decisions live",
]

ADR_REQUIRED_FM = [
    "id", "title", "status", "date", "context", "problem",
    "decision", "consequences_short", "reversal_cost",
]
ADR_STATUS_RE = re.compile(r"^(proposed|accepted|superseded-by\s+\d+)$")
ADR_REVERSAL = {"low", "medium", "high"}
ADR_SECTIONS = ["Context", "Problem", "Options considered", "Decision", "Consequences"]

CLAIM_ID_RE = re.compile(r"^[A-Z][A-Z0-9]{1,7}-\d{3}$")
CLAIM_STATUS = {"unverified", "implemented", "verified"}
ANCHOR_RE = re.compile(r"^@\./[^\s#]+(#[A-Za-z_][A-Za-z0-9_.]*)?$")
PLACEHOLDER_RE = re.compile(r"<[^>\n]{1,60}>")

# EARS: every claim must be falsifiable and shaped like one of the five patterns.
EARS_RE = re.compile(
    r"^(When\s|While\s|Where\s|If\s.+,\s*then\s|The\s|[A-Z][A-Za-z0-9_]*\s+shall\s)", re.I
)


class Report:
    def __init__(self):
        self.errors, self.warns, self.files = [], [], 0

    def error(self, path, msg):
        self.errors.append(f"{path}: ERROR {msg}")

    def warn(self, path, msg):
        self.warns.append(f"{path}: WARN  {msg}")


def split_frontmatter(text):
    """Return (frontmatter_dict, body, ok). Preserves list values as lists."""
    if not text.startswith("---\n"):
        return {}, text, False
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text, False
    raw, body = text[4:end], text[end + 4:].lstrip("\n")

    fm, key = {}, None
    for line in raw.split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith((" ", "\t")) and line.lstrip().startswith("- ") and key:
            fm.setdefault(key, [])
            if not isinstance(fm[key], list):
                fm[key] = []
            fm[key].append(line.lstrip()[2:].strip().strip("\"'"))
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip(), val.strip()
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            fm[key] = [v.strip().strip("\"'") for v in inner.split(",") if v.strip()] if inner else []
        elif val == "":
            fm[key] = []
        else:
            fm[key] = val.strip("\"'")
    return fm, body, True


def headings(body):
    return [m.group(1).strip() for m in re.finditer(r"^##\s+(.+)$", body, re.M)]


def code_blocks(body):
    """Yield (start_line_index, length_in_lines) for each fenced block."""
    lines, i = body.split("\n"), 0
    while i < len(lines):
        if lines[i].lstrip().startswith("```"):
            j = i + 1
            while j < len(lines) and not lines[j].lstrip().startswith("```"):
                j += 1
            yield i, j - i - 1
            i = j + 1
        else:
            i += 1


def has_placeholders(text):
    return bool(PLACEHOLDER_RE.search(text))


def check_steering(path, text, rep, template=False):
    fm, body, ok = split_frontmatter(text)
    if not ok:
        rep.error(path, "no YAML frontmatter (must start with a --- block)")
        return

    for field in STEERING_REQUIRED_FM:
        if field not in fm:
            rep.error(path, f"frontmatter missing required field '{field}'")

    status = fm.get("status")
    if status and status not in STEERING_STATUS:
        rep.error(path, f"status '{status}' not in {sorted(STEERING_STATUS)}")

    owns = fm.get("owns", "")
    if isinstance(owns, str) and " and " in owns.lower() and not template:
        rep.warn(path, "'owns' joins two responsibilities with 'and' — does this package "
                       "pass the nesting rule, or should it be split?")

    if not template and isinstance(fm.get("package"), str):
        actual = os.path.dirname(os.path.dirname(os.path.normpath(path)))
        declared = os.path.normpath(fm["package"])
        if actual and not actual.endswith(declared):
            rep.error(path, f"frontmatter package '{declared}' does not match location '{actual}'")

    for field in ("read_when", "claims", "covers"):
        if field in fm and not isinstance(fm[field], list):
            rep.error(path, f"'{field}' must be a list")

    if isinstance(fm.get("read_when"), list) and not fm["read_when"]:
        rep.warn(path, "'read_when' is empty — agents use it to decide whether to read this doc")

    # Body structure
    found = headings(body)
    missing = [s for s in STEERING_SECTIONS if s not in found]
    if missing:
        rep.error(path, f"missing required section(s): {', '.join(missing)}")
    ordered = [s for s in found if s in STEERING_SECTIONS]
    if ordered != [s for s in STEERING_SECTIONS if s in ordered]:
        rep.error(path, "sections are out of order; use the template's order")
    if "Changelog" in found:
        rep.error(path, "steering docs carry no changelog — that moved to "
                        ".design/DESIGN_CHANGELOG.md so steering could stay lean")

    # Size discipline
    n_lines = len(text.rstrip().split("\n"))
    if n_lines > MAX_STEERING_LINES:
        rep.error(path, f"{n_lines} lines (limit {MAX_STEERING_LINES}) — split the package "
                        f"or stop narrating code")
    for start, length in code_blocks(body):
        if length > MAX_CODE_BLOCK_LINES:
            rep.error(path, f"code block at body line {start + 1} is {length} lines "
                            f"(limit {MAX_CODE_BLOCK_LINES}) — point at the symbol instead")

    # Claims table
    declared = set(fm.get("claims") or [])
    table = set()
    for row in re.finditer(r"^\|\s*([A-Za-z0-9<>_-]+)\s*\|(.+)\|(.+)\|(.+)\|\s*$", body, re.M):
        cid, claim, _anchor, status_cell = (c.strip() for c in row.groups())
        if cid in ("ID", "----", "---") or set(cid) <= {"-"}:
            continue
        if template and has_placeholders(cid):
            continue
        table.add(cid)
        if not CLAIM_ID_RE.match(cid):
            rep.error(path, f"claim id '{cid}' is not PREFIX-NNN")
        if status_cell not in CLAIM_STATUS:
            rep.error(path, f"claim {cid} status '{status_cell}' not in {sorted(CLAIM_STATUS)}")
        if not EARS_RE.match(claim):
            rep.warn(path, f"claim {cid} is not in EARS form "
                           f"(When…/While…/Where…/If…then…/<Component> shall…)")
    if not template:
        for cid in declared - table:
            rep.error(path, f"frontmatter claims '{cid}' but no table row defines it")
        for cid in table - declared:
            rep.error(path, f"table defines '{cid}' but frontmatter does not list it")

    # Anchors
    anchors = [ln.strip() for ln in body.split("\n") if ln.strip().startswith("@./")]
    for a in anchors:
        if template and has_placeholders(a):
            continue
        if not ANCHOR_RE.match(a):
            rep.error(path, f"anchor '{a}' is malformed — expected @./path/to/File.ext#Symbol")
    if not anchors and not template:
        rep.warn(path, "no inline @./ anchors — nothing binds this doc to code, so drift "
                       "cannot tell you when it goes stale")
    if not template:
        covers = fm.get("covers") or []
        cover_set = {c.lstrip("@./") for c in covers}
        anchor_set = {a[3:] for a in anchors}
        for extra in anchor_set - cover_set:
            rep.warn(path, f"anchor '{extra}' is not in frontmatter 'covers' — "
                           f"link-steering.sh projects 'covers', so this one will not be stamped")


def check_adr(path, text, rep, template=False):
    fm, body, ok = split_frontmatter(text)
    if not ok:
        rep.error(path, "no YAML frontmatter (must start with a --- block)")
        return

    for field in ADR_REQUIRED_FM:
        if field not in fm:
            rep.error(path, f"frontmatter missing required field '{field}'")

    if not template:
        base = os.path.basename(path)
        m = re.match(r"^(\d{4})-[a-z0-9-]+\.md$", base)
        if not m:
            rep.error(path, "filename must be NNNN-kebab-slug.md")
        elif str(fm.get("id", "")).zfill(4) != m.group(1):
            rep.error(path, f"frontmatter id '{fm.get('id')}' does not match filename '{m.group(1)}'")

        status = str(fm.get("status", ""))
        if status and not ADR_STATUS_RE.match(status):
            rep.error(path, f"status '{status}' must be proposed | accepted | superseded-by NNNN")

    rc = str(fm.get("reversal_cost", ""))
    if rc and rc not in ADR_REVERSAL and not template:
        rep.error(path, f"reversal_cost '{rc}' not in {sorted(ADR_REVERSAL)}")

    # The frontmatter head is what Dr. Nick reads instead of the body — it has to stand alone.
    for field in ("context", "problem", "decision", "consequences_short"):
        val = fm.get(field)
        if isinstance(val, str) and val and len(val) > 240:
            rep.warn(path, f"'{field}' is {len(val)} chars — the head is a scan surface; "
                           f"keep it to a sentence and put the detail in the body")
    problem = fm.get("problem")
    if (isinstance(problem, str) and problem and not template
            and not problem.rstrip().endswith("?")):
        rep.warn(path, "'problem' reads better as a question")

    found = headings(body)
    missing = [s for s in ADR_SECTIONS if s not in found]
    if missing:
        rep.error(path, f"missing required section(s): {', '.join(missing)}")

    if "Options considered" in found:
        seg = body.split("## Options considered", 1)[1].split("\n## ", 1)[0]
        n_opts = len(re.findall(r"^###\s+", seg, re.M))
        if n_opts < 2 and not template:
            rep.warn(path, f"only {n_opts} option documented — an ADR with one option is a diary "
                           f"entry; record what the obvious alternatives were and why they lost")


def validate(path, rep, template=False):
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        rep.error(path, f"cannot read: {exc}")
        return
    rep.files += 1
    norm = path.replace(os.sep, "/")
    if "/.design/adrs/" in norm or os.path.basename(path) == "adr.md":
        check_adr(path, text, rep, template)
    else:
        check_steering(path, text, rep, template)


def discover(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in
                       (".git", "node_modules", "build", "target", "dist", ".gradle")]
        base = os.path.basename(dirpath)
        parent = os.path.basename(os.path.dirname(dirpath))
        if base == ".steering" or (base == "adrs" and parent == ".design"):
            out += [os.path.join(dirpath, f) for f in sorted(filenames) if f.endswith(".md")]
    return out


def main(argv):
    rep, template, paths = Report(), False, []
    args = argv[1:] or ["--all"]

    if args[0] == "--self-test":
        here = os.path.dirname(os.path.abspath(__file__))
        tpl = os.path.join(os.path.dirname(here), "templates")
        paths = [os.path.join(tpl, f) for f in ("steering.md", "adr.md")]
        template = True
    elif args[0] == "--all":
        paths = discover(args[1] if len(args) > 1 else ".")
    elif args[0] == "--package":
        if len(args) < 2:
            print("--package needs a directory", file=sys.stderr)
            return 2
        paths = discover(args[1])
    else:
        paths = args

    if not paths:
        print("no steering docs or ADRs found")
        return 0

    for p in paths:
        validate(p, rep, template)

    for line in rep.warns:
        print(line)
    for line in rep.errors:
        print(line)

    print(f"\n{rep.files} file(s): {len(rep.errors)} error(s), {len(rep.warns)} warning(s)")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
