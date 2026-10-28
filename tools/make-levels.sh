#!/bin/sh
# npm run levels: build every level of world 1 at once, one process per level,
# then join them in order into src/levels/world1.generated.ts. The file is only
# replaced when every level built.
set -e
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
n=$(npx tsx tools/make-levels.ts --count)
pids=""
i=1
while [ "$i" -le "$n" ]; do
  npx tsx tools/make-levels.ts --level "$i" > "$dir/$i.ts" &
  pids="$pids $!"
  i=$((i + 1))
done
for pid in $pids; do wait "$pid"; done
{
  npx tsx tools/make-levels.ts --head
  i=1
  while [ "$i" -le "$n" ]; do cat "$dir/$i.ts"; i=$((i + 1)); done
  npx tsx tools/make-levels.ts --tail
} > "$dir/all.ts"
mv "$dir/all.ts" src/levels/world1.generated.ts
