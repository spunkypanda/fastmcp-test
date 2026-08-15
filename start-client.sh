#!/usr/bin/env bash
# Start the React client (Vite dev server on port 5173).
set -euo pipefail
cd "$(dirname "$0")/client"

exec npm run dev
