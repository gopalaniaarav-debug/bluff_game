#!/usr/bin/env bash
#
# Bluff Game — one-command launcher.
#
# Starts the API server (4000), the Vite client (5173) and the ngrok tunnel,
# in the right order, cleaning up anything stale first. Press Ctrl+C to stop
# everything at once.
#
# Usage:
#   ./start.sh                # tunnel with a random ngrok URL
#   ./start.sh <ngrok-domain> # tunnel with your reserved ngrok domain
#
# Example:
#   ./start.sh overload-profile-repave.ngrok-free.dev

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT/server"
CLIENT_DIR="$ROOT/client"
NGROK_DOMAIN="${1:-}"

CLIENT_PORT=5173
SERVER_PORT=4000

log() { printf "\033[1;36m[bluff]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[bluff]\033[0m %s\n" "$*"; }

# --- Clean up anything already running on our ports / old ngrok agents ---
kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    warn "Freeing port $port (killing: $pids)"
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

log "Cleaning up old processes..."
kill_port "$SERVER_PORT"
kill_port "$CLIENT_PORT"
pkill -f "ngrok http" 2>/dev/null || true
sleep 1

PIDS=()
cleanup() {
  echo
  log "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  pkill -f "ngrok http" 2>/dev/null || true
  kill_port "$SERVER_PORT"
  kill_port "$CLIENT_PORT"
  exit 0
}
trap cleanup INT TERM

# --- 1. API server ---
log "Starting API server on :$SERVER_PORT..."
( cd "$SERVER_DIR" && npm start ) &
PIDS+=($!)

# --- 2. Vite client ---
log "Starting client on :$CLIENT_PORT..."
( cd "$CLIENT_DIR" && npm run dev ) &
PIDS+=($!)

# --- 3. Wait until Vite is actually serving before launching the tunnel ---
log "Waiting for the client to come online..."
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$CLIENT_PORT/"; then
    log "Client is up."
    break
  fi
  sleep 0.5
done

if ! curl -s -o /dev/null "http://127.0.0.1:$CLIENT_PORT/"; then
  warn "Client did not come up on :$CLIENT_PORT — check the logs above."
fi

# --- 4. ngrok tunnel (force IPv4 with 127.0.0.1 to avoid the [::1] refusal) ---
if command -v ngrok >/dev/null 2>&1; then
  if [ -n "$NGROK_DOMAIN" ]; then
    log "Starting ngrok -> https://$NGROK_DOMAIN"
    ngrok http "127.0.0.1:$CLIENT_PORT" --url "https://$NGROK_DOMAIN" &
  else
    log "Starting ngrok (random URL)..."
    ngrok http "127.0.0.1:$CLIENT_PORT" &
  fi
  PIDS+=($!)
  sleep 3
  log "Public URL (also see http://127.0.0.1:4040):"
  curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | grep -o 'https://[a-zA-Z0-9.-]*ngrok[a-zA-Z0-9./-]*' | head -1 || true
else
  warn "ngrok not found — skipping tunnel. Install it or run it yourself."
fi

log "All set. Press Ctrl+C to stop everything."
wait
