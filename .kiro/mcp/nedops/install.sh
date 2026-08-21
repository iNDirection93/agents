#!/usr/bin/env bash
set -euo pipefail

# NedOps MCP — install script
# Run from services/ workspace root: bash .kiro/mcp/nedops/install.sh

if ! command -v go &>/dev/null; then
  echo "Error: Go is not installed. Install it from https://go.dev/dl/ and try again."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/bin"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

mkdir -p "$BIN_DIR"

# Build NedOps MCP server
cd "$SCRIPT_DIR"
go build -o "$BIN_DIR/nedops-mcp" ./cmd/nedops-mcp
echo "✅ nedops-mcp installed at $BIN_DIR/nedops-mcp"

# Build mock-server (consolidated KAS + LCP + token exchange mock)
cd "$WORKSPACE_ROOT/docker/mock-server"
go build -o "$BIN_DIR/mock-server" .
echo "✅ mock-server installed at $BIN_DIR/mock-server"
