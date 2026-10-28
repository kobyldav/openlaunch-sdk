#!/usr/bin/env bash
# One command on Fedora: bash scripts/fedora-full-test.sh [--all|--live|--wasm]
# No sudo, no source modifications, no Git push, no website deployment.
set -uo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js >=18 is required (Node.js 22 LTS recommended)." >&2
  exit 2
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is missing; install Node.js and npm first." >&2
  exit 2
fi
exec node scripts/fedora-suite.mjs "$@"
