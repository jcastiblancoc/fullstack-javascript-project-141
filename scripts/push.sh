#!/usr/bin/env bash
set -euo pipefail

BRANCH=${1:-main}
REMOTE=${2:-origin}

echo "Preparing to push changes to ${REMOTE}/${BRANCH}"

git status --porcelain

FILES=("code/.env.example" "scripts/setup.js" "Makefile" "package.json" ".gitignore" "scripts/push-to-github.ps1")
TO_ADD=()
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    TO_ADD+=("$f")
  fi
done

if [ ${#TO_ADD[@]} -eq 0 ]; then
  echo "No files found to add." >&2
  exit 1
fi

git add "${TO_ADD[@]}"
MSG=${3:-"ci: add setup script and env example; update Makefile"}
git commit -m "$MSG" || echo "Nothing to commit or commit failed"
git push "$REMOTE" "$BRANCH"

echo "Push complete."
