import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkLinks, digest, inventory, lookup, parseDocument, validate } from "../docs.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sofix-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/model.py"), "def forecast():\n    return 0\n");
  const rule = (id, requires = []) => ({
    id, anchor: id.toLowerCase(), status: "implemented", aliases: [id === "PLAY-001" ? "recommendation" : "capture"],
    paths: id === "PLAY-001" ? ["src/model.py"] : [], requires,
    sources: [{ path: "src/model.py", symbol: "forecast" }], tests: [],
    review: { date: "2026-10-28", note: "Read implementation; no test execution claimed.", files: { "src/model.py": digest(root, "src/model.py") } },
  });
  const registry = { version: 1, contracts: [rule("PLAY-001", ["LOCK-001"]), rule("LOCK-001")], trials: [] };
  const document = () => `${registry.contracts.map(c => `<a id="${c.anchor}"></a>\n## ${c.id}\nRule: retain zero; unknown is not zero.\n`).join("\n")}<!-- contracts:end -->\n\n\`\`\`json context-registry\n${JSON.stringify(registry)}\n\`\`\`\n`;
  return { root, registry, document };
}

test("lookup loads dependencies, preserves the rule text and explains matches", t => {
  const f = fixture(t);
  const result = lookup(f.document(), "change recommendation");
  assert.deepEqual(result.contracts.map(c => c.id), ["PLAY-001", "LOCK-001"]);
  assert.match(result.contracts[1].reason, /PLAY-001/);
  assert.match(result.contracts[1].text, /unknown is not zero/);
  assert.equal(result.fallback, false);
});

test("Windows paths and source symbols route to the same contracts", t => {
  const f = fixture(t);
  for (const query of ["src\\model.py", "forecast"]) {
    assert.deepEqual(lookup(f.document(), query).contracts.map(c => c.id), ["PLAY-001", "LOCK-001"]);
  }
});

test("unknown requests keep the legacy reading fallback; substrings do not invent matches", t => {
  const f = fixture(t);
  assert.equal(lookup(f.document(), "recapture skylight").fallback, true);
  assert.equal(lookup(f.document(), "A general forecast about the roadmap").fallback, true);
});

test("a dependency cycle terminates without dropping a constraint", t => {
  const f = fixture(t);
  f.registry.contracts[1].requires = ["PLAY-001"];
  assert.equal(lookup(f.document(), "recommendation").contracts.length, 2);
});

test("valid evidence passes; changed source invalidates evidence without revoking rules", t => {
  const f = fixture(t);
  assert.deepEqual(validate(f.root, f.document()), []);
  writeFileSync(join(f.root, "src/model.py"), "def forecast():\n    return 1\n");
  assert.match(validate(f.root, f.document()).join("\n"), /PLAY-001.*stale/);
  assert.equal(lookup(f.document(), "recommendation").contracts.length, 2);
});

test("line ending changes do not invalidate a source review", t => {
  const f = fixture(t);
  writeFileSync(join(f.root, "src/model.py"), "def forecast():\r\n    return 0\r\n");
  assert.deepEqual(validate(f.root, f.document()), []);
});

test("duplicate IDs, missing dependencies and missing sections fail", t => {
  const f = fixture(t);
  f.registry.contracts[1].id = "PLAY-001";
  const errors = validate(f.root, f.document()).join("\n");
  assert.match(errors, /duplicate.*PLAY-001/);
  assert.match(errors, /unknown dependency LOCK-001/);
  assert.match(validate(f.root, f.document().replace('<a id="play-001"></a>', "")).join("\n"), /missing section/);
});

test("a mentioned name in a comment is not a resolved source symbol", t => {
  const f = fixture(t);
  writeFileSync(join(f.root, "src/model.py"), "# forecast used to exist\ndef other(): pass\n");
  assert.match(validate(f.root, f.document()).join("\n"), /unresolved symbol forecast/);
});

test("missing files, escaping paths and absent test cases fail clearly", t => {
  const f = fixture(t);
  f.registry.contracts[0].sources.push({ path: "missing.py" }, { path: "../outside.py" });
  f.registry.contracts[0].tests.push({ path: "src/model.py", case: "reject late input" });
  const errors = validate(f.root, f.document()).join("\n");
  assert.match(errors, /missing file missing.py/);
  assert.match(errors, /outside repository/);
  assert.match(errors, /unresolved test case/);
});

test("superseded contracts need a current successor and are never returned as active rules", t => {
  const f = fixture(t);
  f.registry.contracts[0].status = "superseded";
  assert.match(validate(f.root, f.document()).join("\n"), /successor/);
  f.registry.contracts[0].supersededBy = "LOCK-001";
  assert.deepEqual(lookup(f.document(), "recommendation").contracts.map(c => c.id), ["LOCK-001"]);
});

test("missing or malformed registries fail instead of silently returning empty coverage", () => {
  assert.throws(() => parseDocument("# no registry"), /registry/);
  assert.throws(() => parseDocument("```json context-registry\n{bad}\n```"), /registry/);
  assert.throws(() => parseDocument('```json context-registry\n{"version":1,"contracts":[],"trials":[]}\n```'), /registry/);
});

test("inventory is deterministic and includes route/table identities but excludes route tests", t => {
  const f = fixture(t);
  const files = ["frontend/app/play/page.tsx", "frontend/app/api/example/route.ts", "frontend/app/api/example/route.test.ts", "backend/app/models.py"];
  mkdirSync(join(f.root, "backend/app"), { recursive: true });
  writeFileSync(join(f.root, "backend/app/models.py"), 'class Row:\n    __tablename__ = "read_models"\n');
  assert.equal(inventory(f.root, files), inventory(f.root, [...files].reverse()));
  assert.match(inventory(f.root, files), /read_models/);
  assert.doesNotMatch(inventory(f.root, files), /route.test/);
});

test("inventory derives schedules from the timetable so timer edits invalidate the generated reference", t => {
  const f = fixture(t);
  mkdirSync(join(f.root, "clock"));
  const path = join(f.root, "clock/timetable.json");
  writeFileSync(path, JSON.stringify({ jobs: [{ workflow: "refresh.yml", cron: "7 12 * * *" }] }));
  const before = inventory(f.root, ["clock/timetable.json"]);
  assert.match(before, /7 12 \* \* \*/);
  writeFileSync(path, JSON.stringify({ jobs: [{ workflow: "refresh.yml", cron: "8 12 * * *" }] }));
  assert.notEqual(inventory(f.root, ["clock/timetable.json"]), before);
});

test("a test title mentioned only in a comment is not executable evidence", t => {
  const f = fixture(t);
  writeFileSync(join(f.root, "src/check.test.ts"), '// rejects late input\nit("other case", () => {});\n');
  f.registry.contracts[0].tests.push({ path: 'src/check.test.ts', case: 'rejects late input' });
  f.registry.contracts[0].review.files['src/check.test.ts'] = digest(f.root, 'src/check.test.ts');
  assert.match(validate(f.root, f.document()).join('\n'), /unresolved test case/);
});

test("frozen retrieval cases detect dropped critical contracts", t => {
  const f = fixture(t);
  f.registry.trials = [{ prompt: "recommendation", expected: ["PLAY-001", "LOCK-001"], forbidden: [] }];
  assert.deepEqual(validate(f.root, f.document()), []);
  f.registry.contracts[0].requires = [];
  assert.match(validate(f.root, f.document()).join("\n"), /retrieval.*LOCK-001/);
});

test("frozen retrieval cases enforce an explicit legacy fallback", t => {
  const f = fixture(t);
  f.registry.trials = [{ prompt: "recommendation", expected: [], forbidden: [], fallback: true }];
  assert.match(validate(f.root, f.document()).join("\n"), /fallback/);
});

test("link checks cover real headings and line references, ignoring fenced examples", t => {
  const f = fixture(t);
  writeFileSync(join(f.root, "guide.md"), '# Guide\n\n## Some rule\n');
  const good = '[rule](guide.md#some-rule) [line](src/model.py#L2)\n```md\n[example](absent.md)\n```';
  assert.deepEqual(checkLinks(f.root, good, 'index.md'), []);
  const bad = '[bad](guide.md#gone) [line](src/model.py#L200) [missing](absent.md)';
  assert.equal(checkLinks(f.root, bad, 'index.md').length, 3);
});
