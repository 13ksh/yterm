#!/usr/bin/env node
"use strict"

try {
  require("tsx/cjs")
} catch {
  process.stderr.write("tsx 가 필요합니다. 이 폴더에서 npm install 을 먼저 실행하세요.\n")
  process.exit(1)
}

require("../src/cli/index.ts")
