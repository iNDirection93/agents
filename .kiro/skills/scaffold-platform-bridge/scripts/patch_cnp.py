"""Patch a CiliumNetworkPolicy: add platform port to ingress rules.

Only patches within the ingress section — never touches egress.

Expects env vars: CNP_FILE, PORT, EXISTING_PORT
"""
import os
import sys

cnp_file = os.environ["CNP_FILE"]
port = os.environ["PORT"]
existing_port = os.environ["EXISTING_PORT"]

with open(cnp_file, "r") as f:
    lines = f.readlines()

result = []
patched = False
in_ingress = False

for i, line in enumerate(lines):
    result.append(line)

    # Track whether we're in the ingress section
    if line.strip().startswith("ingress:"):
        in_ingress = True
    if in_ingress and line.strip().startswith("egress:"):
        in_ingress = False

    # Only patch within the ingress section
    if not patched and in_ingress and "protocol: TCP" in line and i > 0 and f'port: "{existing_port}"' in lines[i - 1]:
        indent = len(lines[i - 1]) - len(lines[i - 1].lstrip())
        indent_str = " " * indent
        result.append(f"{indent_str}- port: \"{port}\"\n")
        result.append(f"{indent_str}  protocol: TCP\n")
        patched = True

if patched:
    with open(cnp_file, "w") as f:
        f.writelines(result)
    print(f"  ✅ Added port {port} to CiliumNetworkPolicy ingress")
else:
    print(f"  ⚠️  Could not auto-patch CNP — add port {port} to ingress manually")
