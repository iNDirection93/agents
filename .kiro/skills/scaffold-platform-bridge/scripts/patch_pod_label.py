"""Patch a Helm chart Deployment: add discovery label to pod template.

Required for gateway egress CNP — without it, cross-namespace traffic is blocked.

Expects env vars: HELM_CHART, SERVICE_LABEL
"""
import os
import sys

helm_chart = os.environ["HELM_CHART"]
service_label = os.environ["SERVICE_LABEL"]
component = f"{service_label}-server"
label_line = f"        tool-platform.appian.com/server-id: {service_label}\n"

# Check if already present at pod template indent level (8 spaces)
with open(helm_chart, "r") as f:
    lines = f.readlines()

content = "".join(lines)
if f"        tool-platform.appian.com/server-id: {service_label}" in content:
    print("  ℹ️  Pod template label already present")
    sys.exit(0)

result = []
in_target_deployment = False
seen_template = False
patched = False

for i, line in enumerate(lines):
    result.append(line)

    if f"app.kubernetes.io/component: {component}" in line and not in_target_deployment:
        in_target_deployment = True
        continue

    if in_target_deployment and line.strip() == "---":
        in_target_deployment = False
        seen_template = False

    if in_target_deployment and "template:" in line and "volumeMount" not in line:
        seen_template = True

    if in_target_deployment and seen_template and not patched:
        if f"app.kubernetes.io/component: {component}" in line:
            stripped = line.rstrip("\n")
            indent = len(stripped) - len(stripped.lstrip())
            if indent == 8:
                result.append(label_line)
                patched = True

with open(helm_chart, "w") as f:
    f.writelines(result)

if patched:
    print("  ✅ Added discovery label to pod template (required for gateway egress CNP)")
else:
    print("  ⚠️  Could not auto-add pod template label — add manually under template.metadata.labels:")
    print(f"      tool-platform.appian.com/server-id: {service_label}")
