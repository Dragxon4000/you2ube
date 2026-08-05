#!/usr/bin/env bash
# Build you2ube Desktop for distribution.
#
# Compiles Next.js (production build), compiles Electron sources, then
# invokes electron-builder to package for the current platform.
#
# Usage:
#   chmod +x scripts/electron-build.sh
#   ./scripts/electron-build.sh
#
# Override the target platform:
#   ./scripts/electron-build.sh --mac
#   ./scripts/electron-build.sh --win
#   ./scripts/electron-build.sh --linux

set -euo pipefail
cd "$(dirname "$0")/.."

echo "[electron-build] building Next.js..."
npm run build

echo "[electron-build] compiling electron/*.ts..."
npx tsc -p electron/tsconfig.json

echo "[electron-build] packaging with electron-builder..."
npx electron-builder --config electron-builder.json "$@"

echo "[electron-build] done — output in ./release/"
ls -la release/ 2>/dev/null || true
