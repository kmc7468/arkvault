#!/usr/bin/env bash
# Runs the E2E tests in Docker. Arguments are passed to Playwright (e.g. `-g "cache"`).
# The containers are isolated from the development database and removed afterwards.
set -u
cd "$(dirname "$0")"

export E2E_UID="$(id -u)" E2E_GID="$(id -g)" E2E_ARGS="$*"
E2E_DATA_DIR="$(mktemp -d)"
export E2E_DATA_DIR

compose=(docker compose -f docker-compose.yaml)
"${compose[@]}" up --build --attach playwright --abort-on-container-exit --exit-code-from playwright
code=$?

"${compose[@]}" down --volumes --remove-orphans
rm -rf "$E2E_DATA_DIR"
exit $code
