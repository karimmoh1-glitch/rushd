#!/usr/bin/env bash
# Creates (or recreates) a local Postgres database for development and tests,
# from the current schema plus the hand-written SQL Prisma can't express.
# Local only: refuses anything that isn't on this machine.
#
#   scripts/setup-local-db.sh rushd_test
set -euo pipefail
NAME="${1:-rushd_test}"
URL="postgresql://$(whoami)@localhost:5432/${NAME}"

dropdb -h localhost --if-exists "$NAME"
createdb -h localhost "$NAME"
DATABASE_URL="$URL" npx prisma db push --skip-generate
psql -h localhost "$NAME" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/local-db-extras.sql"
echo "Ready: DATABASE_URL=$URL LOCAL_DB_PROXY=localhost:5433 (start: node scripts/local-db-proxy.mjs)"
