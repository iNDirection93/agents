"""Patch a Helm chart Service: add discovery label + platform port.

Expects env vars: HELM_CHART, SERVICE_LABEL, PORT
"""
import os
import sys

helm_chart = os.environ["HELM_CHART"]
service_label = os.environ["SERVICE_LABEL"]
port = os.environ["PORT"]

with open(helm_chart, "r") as f:
    content = f.read()

lines = content.split("\n")
result = []
i = 0
in_target_service = False
found_service_labels = False
found_service_ports = False

while i < len(lines):
    line = lines[i]

    # Detect start of a Service block
    if "kind: Service" in line:
        lookahead = "\n".join(lines[i:i+20])
        if service_label in lookahead and "selector:" in lookahead:
            in_target_service = True
            found_service_labels = False
            found_service_ports = False

    # Detect end of Service block
    if in_target_service and line.strip() == "---":
        in_target_service = False

    # Add discovery label after any labels: line in the Service metadata
    if in_target_service and not found_service_labels:
        if "labels" in line and "selector" not in "\n".join(lines[max(0, i - 3):i]):
            result.append(line)
            i += 1
            while i < len(lines) and (lines[i].startswith("    ") or lines[i].strip().startswith("{{")):
                result.append(lines[i])
                i += 1
            result.append(f"    tool-platform.appian.com/server-id: {service_label}")
            found_service_labels = True
            continue

    # Add platform port after existing http port
    if in_target_service and not found_service_ports:
        if "name: http" in line:
            result.append(line)
            result.append(f"  - port: {port}")
            result.append(f"    targetPort: {port}")
            result.append("    name: platform")
            found_service_ports = True
            i += 1
            continue

    result.append(line)
    i += 1

if not found_service_labels and not found_service_ports:
    print("  ❌ ERROR: Could not patch Service — chart structure not recognized", file=sys.stderr)
    print(f"     Manually add label: tool-platform.appian.com/server-id: {service_label}", file=sys.stderr)
    print(f"     Manually add port: {port}", file=sys.stderr)
    sys.exit(1)

with open(helm_chart, "w") as f:
    f.write("\n".join(result))

if found_service_labels:
    print(f"  ✅ Added discovery label: tool-platform.appian.com/server-id: {service_label}")
else:
    print("  ⚠️  Could not add discovery label to Service — add manually")
if found_service_ports:
    print(f"  ✅ Added platform port: {port}")
else:
    print(f"  ⚠️  Could not add platform port (no 'name: http' port found) — add port {port} to Service manually")
