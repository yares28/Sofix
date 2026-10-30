import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

test("every manager-dependent scheduled workflow uses this installation's username without an owner fallback", () => {
  for (const file of ["refresh", "replan", "pro-rebuild", "score-checks"]) {
    const source = readFileSync(new URL(`../../.github/workflows/${file}.yml`, import.meta.url), "utf8");
    assert.match(source, /SORARE_USER:\s*\$\{\{ vars\.SORARE_USER \}\}/, file);
    assert.doesNotMatch(source, /SORARE_USER:.*yares/, file);
  }
});
