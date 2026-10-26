#!/bin/sh
# Deploy: bump the patch version, commit, push main (the push tests, builds and
# publishes), then check that exactly this is live.
#   npm run release
set -e
cd "$(dirname "$0")/.."
[ "$(git branch --show-current)" = main ] || { echo "Release from main only."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit your changes first."; exit 1; }
npm version patch --no-git-tag-version >/dev/null
VERSION=$(node -p "require('./package.json').version")
git commit -q -am "Release $VERSION"
git push -q origin main
sh tools/check-live.sh
