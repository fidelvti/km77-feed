#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/usr/bin:/bin:/usr/sbin:/sbin"

"$REPO_DIR/.venv/bin/python" scripts/generate_feed.py
"$REPO_DIR/.venv/bin/python" scripts/write_index.py

if [ -n "$(/usr/bin/git status --porcelain -- docs)" ]; then
  /usr/bin/git add docs
  /usr/bin/git commit -m "Update feed $(date -u +%Y-%m-%dT%H:%M:%SZ)" -q
  /usr/bin/git push -q
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) updated and pushed"
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) no changes"
fi
