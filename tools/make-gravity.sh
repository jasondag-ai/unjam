#!/bin/sh
# npm run gravity: build the five gravity levels (job 024) at once, then join them into
# src/levels/gravity.generated.ts. The file is only replaced when every level built.
set -e
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
pids=""
for i in 1 2 3 4 5; do
  npx tsx tools/make-gravity.ts --level "$i" > "$dir/$i.ts" &
  pids="$pids $!"
done
for pid in $pids; do wait "$pid"; done
{
  npx tsx tools/make-gravity.ts --head
  cat "$dir/1.ts" "$dir/2.ts" "$dir/3.ts" "$dir/4.ts" "$dir/5.ts"
  npx tsx tools/make-gravity.ts --tail
} > "$dir/all.ts"
mv "$dir/all.ts" src/levels/gravity.generated.ts
