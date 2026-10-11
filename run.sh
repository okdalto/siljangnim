#!/usr/bin/env bash
# Run Siljangnim from source: installs dependencies on first run, then starts
# the desktop app in dev mode. Only Node.js 22+ is required — Python is
# downloaded and managed by the app itself.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required: https://nodejs.org" >&2
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ]; then
  echo "Node.js 22+ is required (found $(node -v))." >&2
  exit 1
fi

if [ ! -d desktop/node_modules ] || [ ! -d studio/node_modules ]; then
  npm install
fi
exec npm run dev
