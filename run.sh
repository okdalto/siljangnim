#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Kill stale processes on our ports ──────────────────────────
free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Port $port in use — killing PIDs: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
}

free_port 8000
free_port 5173

# ── Backend setup ──────────────────────────────────────────────
echo "Setting up backend..."
if [ ! -d "$ROOT/backend/.venv" ]; then
  python3 -m venv "$ROOT/backend/.venv"
fi
source "$ROOT/backend/.venv/bin/activate"
pip install -q -r "$ROOT/backend/requirements.txt"

# ── Frontend setup ─────────────────────────────────────────────
echo "Setting up frontend..."
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  (cd "$ROOT/frontend" && npm install)
fi

# ── Start servers ──────────────────────────────────────────────
echo ""
echo "Starting PromptGL..."
echo "   Backend   → http://localhost:8000"
echo "   Frontend  → http://localhost:5173"
echo "   Rendering → WebGL2 in browser"
echo ""

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Start backend (unset CLAUDECODE to allow Agent SDK subprocess spawning)
(cd "$ROOT/backend" && unset CLAUDECODE && uvicorn main:app --host 0.0.0.0 --port 8000 --reload) &
BACKEND_PID=$!

# Start frontend
(cd "$ROOT/frontend" && npm run dev -- --host 0.0.0.0 --port 5173) &
FRONTEND_PID=$!

wait
