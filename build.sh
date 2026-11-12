#!/bin/sh
# Copies app/ to dist/, stamps the build sha (R6) into index.html, and adds the recordings (served as files).
set -e
SHA=$(git rev-parse HEAD)
rm -rf dist && cp -R app dist
sed -i '' "s/__BUILD_SHA__/$SHA/g" dist/index.html 2>/dev/null || sed -i "s/__BUILD_SHA__/$SHA/g" dist/index.html
mkdir -p dist/recordings
for f in recordings/*/step*.mp4; do [ -f "$f" ] && cp "$f" dist/recordings/; done
echo "built $SHA"
