#!/usr/bin/env bash
# Start the FastMCP server (uvicorn on port 8000).
set -euo pipefail
cd "$(dirname "$0")"

# Load credentials from .env if present (copy .env.example to customize).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export MCP_SECRET_KEY="${MCP_SECRET_KEY:-dev-secret}"
export MCP_USERS="${MCP_USERS:-admin:secret:admin,alice:wonder:user}"

exec .venv/bin/python -m uvicorn main:app \
  --host "${MCP_HOST:-127.0.0.1}" \
  --port "${MCP_PORT:-8000}"
