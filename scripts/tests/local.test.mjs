import assert from "node:assert/strict";
import test from "node:test";
import { localEnvironment, startLocal } from "../local.mjs";

test("local runtime keeps authentication but cannot inherit production database or deployment settings", () => {
  const env = localEnvironment({
    inherited: { PATH: "node", DATABASE_URL: "production", POSTGRES_URL: "production", SOFIX_PRODUCTION: "1", R2_WRITE_SECRET_ACCESS_KEY: "write-secret", APP_URL: "https://hosted.example" },
    settings: { EXTENSION_TOKEN: "test-token", REVALIDATE_SECRET: "test-secret", R2_ACCOUNT_ID: "account", DATABASE_URL: "production", SOFIX_BLOCKS_DIR: "saved-blocks" },
    envDir: "/settings", frontend: "/app/frontend", port: 3000,
  });
  assert.equal(env.APP_URL, "http://127.0.0.1:3000");
  assert.equal(env.EXTENSION_TOKEN, "test-token");
  assert.equal(env.PATH, "node");
  for (const key of ["DATABASE_URL", "POSTGRES_URL", "SOFIX_PRODUCTION", "R2_WRITE_SECRET_ACCESS_KEY"]) assert.ok(!env[key], key);
  assert.match(env.SOFIX_BLOCKS_DIR, /settings[/\\]saved-blocks$/);
});

test("a cold start without blocks refuses an empty app after a failed sync", async () => {
  const events = [];
  await assert.rejects(startLocal({
    running: async () => false,
    sync: async () => { throw new Error("offline"); },
    hasBlocks: () => false,
    build: async () => events.push("build"),
    serve: async () => events.push("serve"),
    warn: () => {},
  }), /No saved blocks/);
  assert.deepEqual(events, []);
});

test("offline restart serves the saved data and keeps the synchronizer available", async () => {
  const events = [];
  const result = await startLocal({
    running: async () => false,
    sync: async () => { events.push("sync"); throw new Error("offline"); },
    hasBlocks: () => true,
    build: async () => events.push("build"),
    serve: async () => events.push("serve"),
    warn: () => events.push("kept"),
  });
  assert.equal(result, "started");
  assert.deepEqual(events, ["sync", "kept", "build", "serve"]);
});

test("reopening the launcher reuses the server without another sync or build", async () => {
  const result = await startLocal({ running: async () => true });
  assert.equal(result, "running");
});
