#!/bin/sh
# Is what was pushed really live? Three checks, waiting up to 5 minutes:
#   1. git ls-remote: GitHub's main is the local HEAD.
#   2. Raw content: package.json at that exact commit has the local version.
#   3. The live version.json, fetched raw with curl and no cache, has that version and build.
#   npm run check-live
cd "$(dirname "$0")/.."
REPO=jasondag-ai/unjam
SHA=$(git rev-parse HEAD)
BUILD=$(git rev-parse --short=7 HEAD)
VERSION=$(node -p "require('./package.json').version")

REMOTE=$(git ls-remote origin refs/heads/main | cut -f1)
[ "$REMOTE" = "$SHA" ] || { echo "NOT PUSHED: origin/main is $REMOTE, HEAD is $SHA."; exit 1; }
echo "1. origin/main is $BUILD."

RAW=$(curl -s "https://raw.githubusercontent.com/$REPO/$SHA/package.json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')
[ "$RAW" = "$VERSION" ] || { echo "RAW MISMATCH: package.json at $BUILD says '$RAW', local says $VERSION."; exit 1; }
echo "2. package.json at $BUILD is version $RAW."

WANT="{\"version\":\"$VERSION\",\"build\":\"$BUILD\"}"
i=0
while [ $i -lt 30 ]; do
  LIVE=$(curl -s -H 'Cache-Control: no-cache' "https://jasondag-ai.github.io/unjam/version.json?t=$(date +%s)")
  if [ "$LIVE" = "$WANT" ]; then echo "3. LIVE: $LIVE"; exit 0; fi
  sleep 10; i=$((i + 1))
done
echo "NOT LIVE: the site says '$LIVE', expected $WANT."
gh run list --repo "$REPO" --limit 3
exit 1
