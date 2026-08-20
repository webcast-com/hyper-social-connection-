#!/usr/bin/env bash
#
# dev-db.sh — one-command local PostgreSQL for this app. No Docker needed.
#
# Installs real PostgreSQL binaries via npm (@embedded-postgres/linux-x64),
# initializes a throwaway cluster, and runs it in the background. The app's
# boot migration (src/lib/migrate.ts) creates the schema and seeds demo data
# automatically on the first request after connecting.
#
# Usage:
#   scripts/dev-db.sh          # or: scripts/dev-db.sh start
#   scripts/dev-db.sh stop     # stop the server
#   scripts/dev-db.sh status   # is it running?
#   scripts/dev-db.sh reset    # wipe + re-init (fresh demo data on next app boot)
#
# Override the defaults via environment variables:
#   PG_ROOT     where the npm binaries live     (default /tmp/pgsql)
#   PGDATA_DIR  where the cluster data lives    (default /tmp/pgdata)
#   PGPORT      port to listen on               (default 55432)
#   PG_PKG      npm package w/ Postgres binaries (default @embedded-postgres/linux-x64@18.4.0-beta.17)
#
# Matches .env defaults in this repo:
#   DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres
#   DATABASE_SSL=false

set -euo pipefail

PG_ROOT="${PG_ROOT:-/tmp/pgsql}"
PGDATA_DIR="${PGDATA_DIR:-/tmp/pgdata}"
PGHOST="127.0.0.1"
PGPORT="${PGPORT:-55432}"
PG_PKG="${PG_PKG:-@embedded-postgres/linux-x64@18.4.0-beta.17}"

PG_LOG="${PGDATA_DIR}.log"
NATIVE="$PG_ROOT/node_modules/@embedded-postgres/linux-x64/native"
INITDB="$NATIVE/bin/initdb"
PGCTL="$NATIVE/bin/pg_ctl"
POSTGRES="$NATIVE/bin/postgres"

c_green=$'\033[32m'; c_red=$'\033[31m'; c_yellow=$'\033[33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
ok()   { echo "${c_green}✔${c_off} $*"; }
fail() { echo "${c_red}✘ $*${c_off}" >&2; }
step() { echo "${c_yellow}→${c_off} $*"; }

ensure_binaries() {
  if [ -x "$POSTGRES" ]; then
    return
  fi
  step "PostgreSQL binaries not found — installing $PG_PKG into $PG_ROOT (needs network)"
  mkdir -p "$PG_ROOT"
  if ! npm install --prefix "$PG_ROOT" --no-audit --no-fund "$PG_PKG" >/dev/null; then
    fail "npm install failed — check network access to registry.npmjs.org"
    exit 1
  fi
  [ -x "$POSTGRES" ] || { fail "binaries did not land where expected ($POSTGRES)"; exit 1; }
  ok "Binaries installed ($("$POSTGRES" --version 2>/dev/null || echo postgres))"
}

is_running() {
  # pg_ctl exits 0 when the server is running, 3 when it is not
  "$PGCTL" status -D "$PGDATA_DIR" >/dev/null 2>&1
}

is_accepting() {
  # No pg_isready in the stripped binaries — probe the TCP port instead
  (exec 3<>"/dev/tcp/$PGHOST/$PGPORT") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

wait_ready() {
  for _ in $(seq 1 30); do
    is_accepting && return 0
    sleep 0.5
  done
  return 1
}

do_start() {
  ensure_binaries

  if is_running; then
    ok "PostgreSQL already running on ${PGHOST}:${PGPORT} (data: $PGDATA_DIR)"
    print_env_hint
    return
  fi

  if [ ! -s "$PGDATA_DIR/PG_VERSION" ]; then
    step "No cluster at $PGDATA_DIR — running initdb (user: postgres, trust auth)"
    mkdir -p "$(dirname "$PGDATA_DIR")"
    "$INITDB" -D "$PGDATA_DIR" -U postgres --auth=trust -E UTF8 >/dev/null
    ok "Cluster initialized"
  fi

  step "Starting PostgreSQL on ${PGHOST}:${PGPORT} (log: $PG_LOG)"
  # -k /tmp keeps the unix socket path short; postgres stays in the foreground
  # of the pg_ctl-spawned child so it survives this script exiting.
  "$PGCTL" -D "$PGDATA_DIR" -l "$PG_LOG" \
    -o "-p $PGPORT -k /tmp" start >/dev/null

  if wait_ready; then
    ok "PostgreSQL is up and accepting connections"
    print_env_hint
  else
    fail "Server did not become ready in 15s — tail of $PG_LOG:"
    tail -20 "$PG_LOG" >&2 || true
    exit 1
  fi
}

do_stop() {
  if is_running; then
    "$PGCTL" -D "$PGDATA_DIR" stop >/dev/null
    ok "PostgreSQL stopped"
  else
    ok "PostgreSQL is not running"
  fi
}

do_status() {
  ensure_binaries
  if is_running; then
    local ready="not accepting connections yet"
    is_accepting && ready="accepting connections"
    ok "PostgreSQL running on ${PGHOST}:${PGPORT} ($ready, data: $PGDATA_DIR)"
    exit 0
  else
    echo "PostgreSQL is not running (data dir: $PGDATA_DIR)"
    exit 3
  fi
}

do_reset() {
  do_stop || true
  step "Removing $PGDATA_DIR"
  rm -rf "$PGDATA_DIR"
  do_start
  ok "Fresh cluster ready — restart the app (npm run dev) and it will re-create the schema and seed demo data"
}

print_env_hint() {
  echo "${c_dim}Point the app at it (.env):${c_off}"
  echo "${c_dim}  DATABASE_URL=postgres://postgres@${PGHOST}:${PGPORT}/postgres${c_off}"
  echo "${c_dim}  DATABASE_SSL=false${c_off}"
  echo "${c_dim}Demo logins after the app seeds: alex@example.com … marcus@example.com / changeme123${c_off}"
}

case "${1:-start}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; do_start ;;
  status)  do_status ;;
  reset)   do_reset ;;
  *)
    echo "Usage: $0 [start|stop|restart|status|reset]" >&2
    exit 2
    ;;
esac
