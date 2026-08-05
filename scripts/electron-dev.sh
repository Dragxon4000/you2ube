#!/usr/bin/env bash
# Launch you2ube in desktop mode (dev).
#
# Starts the Next.js dev server, waits for it to be ready, then opens the
# Electron window pointing at it. Both processes are killed together on exit.
#
# Usage:
#   chmod +x scripts/electron-dev.sh
#   ./scripts/electron-dev.sh

set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
  echo "[electron-dev] shutting down..."
  [[ -n "${NEXT_PID:-}" ]] && kill "$NEXT_PID" 2>/dev/null || true
  [[ -n "${ELECTRON_PID:-}" ]] && kill "$ELECTRON_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Build the Electron TypeScript sources.
echo "[electron-dev] compiling electron/*.ts..."
npx tsc -p electron/tsconfig.json

# Start Next.js dev server in the background.
echo "[electron-dev] starting Next.js dev server..."
npm run dev > /tmp/you2ube-next.log 2>&1 &
NEXT_PID=$!

# Wait until the dev server is reachable.
echo "[electron-dev] waiting for http://localhost:3000 ..."
for i in {1..60}; do
  if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "[electron-dev] Next.js ready."
    break
  fi
  sleep 1
done

# Launch Electron pointing at the dev server.
echo "[electron-dev] launching Electron..."
DEV_SERVER_URL=http://localhost:3000 npx electron dist-electron/main.js &
ELECTRON_PID=$!

wait "$ELECTRON_PID"
