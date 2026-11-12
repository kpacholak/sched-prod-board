#!/bin/sh
# Copies app/ to dist/ and stamps the build sha (R6) into index.html.
set -e
SHA=$(git rev-parse HEAD)
rm -rf dist && cp -R app dist
sed -i '' "s/__BUILD_SHA__/$SHA/g" dist/index.html 2>/dev/null || sed -i "s/__BUILD_SHA__/$SHA/g" dist/index.html
echo "built $SHA"
