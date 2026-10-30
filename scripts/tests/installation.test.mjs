import assert from "node:assert/strict";
import test from "node:test";
import { repositoryFromRemote, vercelProject } from "../installation.mjs";

test("check commands discover the cloned GitHub repository from its own origin", () => {
  assert.equal(repositoryFromRemote("https://github.com/friend/their-sofix.git"), "friend/their-sofix");
  assert.equal(repositoryFromRemote("git@github.com:friend/their-sofix.git"), "friend/their-sofix");
  assert.equal(repositoryFromRemote("https://github.com/yares28/Sofix.git"), "yares28/Sofix");
  assert.equal(repositoryFromRemote("https://github.com.evil.example/friend/repo"), null);
});

test("usage checks use only this installation's configured or linked project", () => {
  assert.deepEqual(vercelProject({}, { orgId: "friend-team", projectId: "friend-project" }), { team: "friend-team", project: "friend-project" });
  assert.deepEqual(vercelProject({ VERCEL_ORG_ID: "env-team", VERCEL_PROJECT_ID: "env-project" }, { orgId: "linked-team", projectId: "linked-project" }), { team: "env-team", project: "env-project" });
  assert.equal(vercelProject({}), null);
});
