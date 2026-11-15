#!/usr/bin/env bash
# Runs the database access-boundary tests against a throwaway local Postgres.
# Requires Postgres 15+ server binaries (initdb, pg_ctl). Nothing is persisted.
#
#   npm run test:db
#
# To use an existing disposable database instead, set TEST_DATABASE_URL and run:
#   npx vitest run tests/db
set -euo pipefail

PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")}"
if [ ! -x "$PG_BIN/initdb" ]; then
  echo "Postgres server binaries not found. Install Postgres or set PG_BIN / TEST_DATABASE_URL." >&2
  exit 1
fi

PORT="${TEST_DB_PORT:-54329}"
WORK="$(mktemp -d)"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  # initdb refuses to run as root.
  chown postgres "$WORK"
  RUN_AS=(runuser -u postgres --)
fi

cleanup() {
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/log" \
  -o "-p $PORT -k $WORK -c listen_addresses=''" -w start >/dev/null

export TEST_DATABASE_URL="postgresql://postgres@localhost/postgres?host=$WORK&port=$PORT"
npx vitest run tests/db "$@"
