"""Patch a Helm chart Deployment: add platform port + KAS_BASE_URL to existing container.

Expects env vars: HELM_CHART, SERVICE_LABEL, PORT, EXISTING_PORT
"""
import os
import re
import sys

helm_chart = os.environ["HELM_CHART"]
service_label = os.environ["SERVICE_LABEL"]
port = os.environ["PORT"]
existing_port = os.environ["EXISTING_PORT"]
component = f"{service_label}-server"

with open(helm_chart, "r") as f:
    lines = f.readlines()

content = "".join(lines)
if f"containerPort: {port}" in content and "name: platform" in content:
    print("  ℹ️  Platform port already in container — skipping")
    sys.exit(0)

result = []
in_target_deployment = False
seen_template = False
added_port = False
skip_next = False
added_kas = False

for i, line in enumerate(lines):
    if skip_next:
        skip_next = False
        continue

    if f"app.kubernetes.io/component: {component}" in line and not in_target_deployment:
        in_target_deployment = True

    if in_target_deployment and line.strip() == "---":
        in_target_deployment = False
        seen_template = False

    if in_target_deployment and "template:" in line and "volumeMount" not in line:
        seen_template = True

    # Add platform port after existing port's protocol: TCP line
    if in_target_deployment and seen_template and not added_port:
        if f"containerPort: {existing_port}" in line:
            result.append(line)
            if i + 1 < len(lines) and "protocol: TCP" in lines[i + 1]:
                result.append(lines[i + 1])
                skip_next = True
                result.append("        - name: platform\n")
                result.append(f"          containerPort: {port}\n")
                result.append("          protocol: TCP\n")
            else:
                result.append("        - name: platform\n")
                result.append(f"          containerPort: {port}\n")
                result.append("          protocol: TCP\n")
            added_port = True
            continue

    # Add KAS_BASE_URL env var — trigger on envFrom: or resources:/volumeMounts:
    if in_target_deployment and seen_template and not added_kas:
        trigger = False
        if "envFrom:" in line and "KAS_BASE_URL" not in content:
            trigger = True
        elif ("resources:" in line or "volumeMounts:" in line) and "KAS_BASE_URL" not in content:
            trigger = True

        if trigger:
            preceding = "".join(lines[max(0, i - 30):i])
            kas_match = re.search(r'value:.*?({{.*?KAS[^}]*}})', preceding)
            if kas_match:
                kas_value = kas_match.group(1)
                result.append("        - name: KAS_BASE_URL\n")
                result.append(f"          value: {kas_value}\n")
                added_kas = True

    result.append(line)

with open(helm_chart, "w") as f:
    f.writelines(result)

if added_port:
    print(f"  ✅ Added platform port {port} to existing container")
if added_kas:
    print("  ✅ Added KAS_BASE_URL env var")
if not added_port:
    print(f"  ⚠️  Could not add container port — add containerPort: {port} manually")
if not added_kas:
    print("  ⚠️  Could not detect KAS_BASE_URL source — add it manually to the container env")
    print("      Without it, the bridge will crash at startup (dev_mode requires explicit PLATFORM_DEV_MODE=true)")
