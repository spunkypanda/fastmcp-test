#!/usr/bin/env bash
# Start both the MCP server and the React client. Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"

./start-server.sh &
SERVER_PID=$!
./start-client.sh &
CLIENT_PID=$!

cleanup() {
  kill "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait
