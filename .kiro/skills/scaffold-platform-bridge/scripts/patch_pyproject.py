"""Patch pyproject.toml: add tools-platform-sdk dependency to [project] section.

Expects env vars: PYPROJECT
"""
import os
import sys

pyproject = os.environ["PYPROJECT"]

with open(pyproject, "r") as f:
    content = f.read()

lines = content.split("\n")
result = []
in_project = False
in_deps = False
added_dep = False

for i, line in enumerate(lines):
    result.append(line)

    # Track [project] section
    if line.strip() == "[project]":
        in_project = True
    elif line.strip().startswith("[") and in_project:
        in_project = False

    # Only match dependencies = [ inside [project]
    if in_project and "dependencies" in line and "=" in line and "[" in line and not added_dep:
        in_deps = True
        if "]" in line:
            pass  # single-line list — too complex, skip
        continue

    # Inside multi-line dependencies, look for the closing ]
    if in_deps and "]" in line and not added_dep:
        result.pop()
        result.append('    "tools-platform-sdk>=0.1.0",')
        result.append(line)
        in_deps = False
        added_dep = True

if not added_dep:
    print("  ⚠️  Could not auto-add dependency — add manually: \"tools-platform-sdk>=0.1.0\"")
else:
    # Add the index if not present
    if "appian-internal" not in content and "ca-pypi-prod-local" not in content:
        result.append("")
        result.append("[[tool.uv.index]]")
        result.append('name = "appian-internal"')
        result.append('url = "https://artifacts.eng.appianci.net/artifactory/api/pypi/ca-pypi-prod-local/simple"')
        result.append("")

    with open(pyproject, "w") as f:
        f.write("\n".join(result))
    print("  ✅ Added tools-platform-sdk to pyproject.toml")
