// Gate: so kết quả test hiện tại với baseline known-fails và kiểm tra MCP suites.
// PASS nếu KHÔNG có test nào pass(baseline) → fail(now) VÀ mọi test MCP/Skills đạt 100% pass.
// Usage: node tests/__baseline__/verify-no-regression.mjs <current-results.json>
import { readFileSync } from "fs";

const knownFails = new Set(
  readFileSync(new URL("./known-fails.txt", import.meta.url), "utf8")
    .split("\n").map(s => s.trim()).filter(Boolean)
);

const resultsPath = process.argv[2];
if (!resultsPath) {
  console.error("Missing results.json path");
  process.exit(2);
}

const r = JSON.parse(readFileSync(resultsPath, "utf8"));

// 1. Strict Check for MCP / Skills tests: 0 failures allowed
const mcpFails = [];
for (const file of (r.testResults || [])) {
  const relName = file.name.includes("/tests/") ? "tests/" + file.name.split("/tests/")[1] : file.name;
  const isMcpOrSkills = /(?:^|\/)(?:mcp|skills|api-mcp|api-skills)[^\/]*\.test\.js$/i.test(relName);
  if (isMcpOrSkills) {
    for (const a of (file.assertionResults || [])) {
      if (a.status === "failed") {
        mcpFails.push(`${file.name} :: ${a.fullName}`);
      }
    }
  }
}

if (mcpFails.length > 0) {
  console.error(`\n❌ MCP / SKILLS ZERO-FAILURE RULE VIOLATION (${mcpFails.length} failed):\n`);
  mcpFails.forEach(f => console.error("  - " + f));
  process.exit(1);
}

// 2. Regression check against baseline known-fails
const nowFails = (r.testResults || []).flatMap(f =>
  (f.assertionResults || []).filter(a => a.status === "failed")
    .map(a => {
      const relName = f.name.includes("/tests/") ? "tests/" + f.name.split("/tests/")[1] : f.name;
      return relName + " :: " + a.fullName;
    })
);

const regressions = nowFails.filter(f => !knownFails.has(f));

if (regressions.length) {
  console.error(`\n❌ REGRESSION: ${regressions.length} test pass→fail:\n`);
  regressions.forEach(f => console.error("  - " + f));
  process.exit(1);
}

console.log(`✅ Gate Passed: All MCP/Skills suites passed 100%, no baseline regressions. (now fails=${nowFails.length}, baseline known=${knownFails.size})`);
