import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("a clone's generated extension names only its own app and explicit aliases", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sofix-install-"));
  const env = path.join(dir, ".env");
  writeFileSync(env, "APP_URL=https://second.example\nAPP_ORIGINS=https://alias.second.example\nEXTENSION_TOKEN=fixture-token\nVERCEL_BYPASS_SECRET=fixture-bypass\n");
  const result = spawnSync(process.execPath, ["extension/scripts/configure.mjs", "--env-file", env, "--output", dir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.externally_connectable.matches, ["https://second.example/*", "https://alias.second.example/*", "http://localhost/*", "http://127.0.0.1/*"]);
  const config = readFileSync(path.join(dir, "config.js"), "utf8");
  assert.ok(config.includes('"allowedOrigins":["https://second.example","https://alias.second.example"]'));
  assert.ok(!config.includes("sofix-livid"));
  assert.ok(!result.stdout.includes("fixture-token"));
});

test("invalid app origins are rejected before any generated credentials are written", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sofix-install-"));
  const env = path.join(dir, ".env");
  writeFileSync(env, "APP_URL=https://name:credential@second.example\nEXTENSION_TOKEN=fixture-token\nVERCEL_BYPASS_SECRET=fixture-bypass\n");
  const result = spawnSync(process.execPath, ["extension/scripts/configure.mjs", "--env-file", env, "--output", dir], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exact HTTPS origins/);
  assert.ok(!existsSync(path.join(dir, "config.js")));
  assert.ok(!result.stderr.includes("credential"));
});
