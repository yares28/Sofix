#!/usr/bin/env node
/** Offline context lookup and documentation drift checks. No credentials or network requests. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE = "docs/context.md";
const REGISTRY = /```json context-registry\r?\n([\s\S]*?)\r?\n```/g;
const INDEX = /<!-- inventory:start -->[\s\S]*?<!-- inventory:end -->/;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const read = (root, path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const inside = (root, path) => {
  const local = relative(root, resolve(root, path));
  return !isAbsolute(path) && local !== ".." && !local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(local);
};

export function digest(root, path) {
  return createHash("sha256").update(read(root, path)).digest("hex");
}

export function parseDocument(body) {
  const matches = [...body.matchAll(REGISTRY)];
  if (matches.length !== 1) throw new Error("Expected exactly one context registry");
  let registry;
  try { registry = JSON.parse(matches[0][1]); } catch { throw new Error("Invalid JSON in context registry"); }
  if (registry.version !== 1 || !Array.isArray(registry.contracts) || !registry.contracts.length || !Array.isArray(registry.trials)) {
    throw new Error("Unsupported context registry schema");
  }
  return registry;
}

function section(body, anchor) {
  const start = body.indexOf(`<a id="${anchor}"></a>`);
  if (start < 0) return "";
  const end = body.slice(start + 1).search(/<a id="|<!-- contracts:end -->/);
  return body.slice(start, end < 0 ? body.length : start + 1 + end).trim();
}

export function lookup(body, query) {
  const { contracts } = parseDocument(body);
  const byId = new Map(contracts.map(c => [c.id, c]));
  const text = query.toLowerCase().replaceAll("\\", "/");
  const selected = new Map();
  function add(id, reason, visiting = new Set()) {
    if (selected.has(id) || visiting.has(id)) return;
    const c = byId.get(id);
    if (!c) return;
    visiting.add(id);
    if (c.status === "superseded") { add(c.supersededBy, `successor of ${id}`, visiting); return; }
    selected.set(id, { ...c, reason, text: section(body, c.anchor) });
    for (const dependency of c.requires ?? []) add(dependency, `required by ${id}`, visiting);
  }
  for (const c of contracts) {
    // Common function names such as run/forecast are only symbols when requested alone or qualified.
    const symbols = (c.sources ?? []).map(s => s.symbol).filter(s => s &&
      (text.trim() === s.toLowerCase() || new RegExp(`[.:]${escape(s.toLowerCase())}($|[^a-z0-9_])`).test(text)));
    const terms = [c.id, ...(c.aliases ?? []), ...symbols];
    const term = terms.find(t => new RegExp(`(^|[^a-z0-9_])${escape(t.toLowerCase())}($|[^a-z0-9_])`).test(text));
    const path = [...(c.paths ?? []), ...(c.sources ?? []).map(s => s.path), ...(c.tests ?? []).map(s => s.path)]
      .find(p => text.includes(p.toLowerCase()));
    if (term || path) add(c.id, term ? `term ${term}` : `path ${path}`);
  }
  return { fallback: selected.size === 0, contracts: [...selected.values()] };
}

export function validate(root, body) {
  const errors = [];
  let registry;
  try { registry = parseDocument(body); } catch (error) { return [error.message]; }
  const ids = new Set();
  const anchors = new Set();
  for (const c of registry.contracts) {
    if (!/^[A-Z][A-Z0-9-]+-\d{3}$/.test(c.id)) errors.push(`Invalid contract ID ${c.id}`);
    if (ids.has(c.id)) errors.push(`duplicate ID ${c.id}`);
    if (anchors.has(c.anchor)) errors.push(`duplicate anchor ${c.anchor}`);
    ids.add(c.id); anchors.add(c.anchor);
  }
  for (const c of registry.contracts) {
    const fail = message => errors.push(`${c.id}: ${message}`);
    if (!section(body, c.anchor)) fail("missing section");
    if (!["required", "implemented", "known-divergence", "superseded"].includes(c.status)) fail("invalid status");
    if (!Array.isArray(c.requires) || !Array.isArray(c.sources) || !Array.isArray(c.tests) || !Array.isArray(c.aliases) || !Array.isArray(c.paths)) {
      fail("requires, sources, tests, aliases and paths must be arrays"); continue;
    }
    for (const id of c.requires) if (!ids.has(id)) fail(`unknown dependency ${id}`);
    if (c.status === "superseded") {
      const successor = registry.contracts.find(s => s.id === c.supersededBy);
      if (!successor || successor.id === c.id || successor.status === "superseded") fail("needs a current successor");
    }
    if (!c.review?.note || !/^\d{4}-\d{2}-\d{2}$/.test(c.review?.date ?? "")) fail("missing source review record");
    for (const ref of [...c.sources, ...c.tests]) {
      if (typeof ref.path !== "string") { fail("reference needs a path"); continue; }
      if (!inside(root, ref.path)) { fail(`outside repository: ${ref.path}`); continue; }
      if (!existsSync(resolve(root, ref.path))) { fail(`missing file ${ref.path}`); continue; }
      const source = read(root, ref.path);
      // Deliberately supports this registry's Python and TypeScript declarations, not an inferred call graph.
      if (ref.symbol && !new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:def|class|function|const|let|type|interface)\\s+${escape(ref.symbol)}\\b`, "m").test(source)) {
        fail(`unresolved symbol ${ref.symbol} in ${ref.path}`);
      }
      if (ref.case && !new RegExp('^\\s*(?:it|test)\\(\\s*(["\x27`])' + escape(ref.case) + '\\1\\s*,', "m").test(source)) {
        fail(`unresolved test case ${ref.case} in ${ref.path}`);
      }
      if (c.review?.files?.[ref.path] !== digest(root, ref.path)) fail(`stale source review: ${ref.path}`);
    }
  }
  if (errors.length === 0) {
    for (const trial of registry.trials) {
      const result = lookup(body, trial.prompt);
      const actual = new Set(result.contracts.map(c => c.id));
      for (const id of trial.expected ?? []) if (!actual.has(id)) errors.push(`retrieval '${trial.prompt}': missing ${id}`);
      for (const id of trial.forbidden ?? []) if (actual.has(id)) errors.push(`retrieval '${trial.prompt}': unexpected ${id}`);
      if (typeof trial.fallback === "boolean" && trial.fallback !== result.fallback) errors.push(`retrieval '${trial.prompt}': wrong legacy fallback`);
    }
  }
  return errors;
}

export function inventory(root, files) {
  const rows = [];
  for (const file of [...new Set(files)].sort()) {
    if (/^frontend\/app\/.*(?:page\.tsx|route\.ts)$/.test(file)) {
      const route = "/" + file.slice("frontend/app/".length).replace(/(?:^|\/)(?:page\.tsx|route\.ts)$/, "").replace(/\([^/]+\)\//g, "");
      rows.push(`| ${file.endsWith("page.tsx") ? "page" : "API"} | \`${route}\` | \`${file}\` |`);
    }
  }
  if (files.includes("backend/app/models.py")) {
    for (const match of read(root, "backend/app/models.py").matchAll(/__tablename__\s*=\s*["']([^"']+)["']/g)) {
      rows.push(`| table | \`${match[1]}\` | \`backend/app/models.py\` |`);
    }
  }
  return "<!-- inventory:start -->\n| Kind | Identity | Source |\n|---|---|---|\n" + rows.join("\n") + "\n<!-- inventory:end -->";
}

export function checkLinks(root, body, path) {
  const errors = [];
  const unfenced = body.replace(/```[^\n]*\n[\s\S]*?```/g, "");
  for (const match of unfenced.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    const [name, fragment] = target.split("#");
    let resolved;
    try { resolved = relative(root, resolve(root, dirname(path), decodeURIComponent(name || path.split("/").at(-1)))); }
    catch { errors.push(`${path}: malformed link ${target}`); continue; }
    if (!inside(root, resolved) || !existsSync(resolve(root, resolved))) { errors.push(`${path}: missing link ${target}`); continue; }
    if (!fragment) continue;
    const content = read(root, resolved);
    if (/^L\d+$/.test(fragment)) {
      if (+fragment.slice(1) > content.split("\n").length) errors.push(`${path}: out-of-range line ${target}`);
    } else if (resolved.endsWith(".md")) {
      const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => m[1].toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/g, "-"));
      if (!headings.includes(fragment) && !content.includes(`id="${fragment}"`)) errors.push(`${path}: missing anchor ${target}`);
    }
  }
  return errors;
}

function filesInRepo() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
}

function main() {
  const [command = "check", ...args] = process.argv.slice(2);
  let body = read(ROOT, REFERENCE);
  if (command === "lookup") {
    if (!args.length) throw new Error('Usage: node scripts/docs.mjs lookup "task or path"');
    const result = lookup(body, args.join(" "));
    console.log("Always read AGENTS.md and CLAUDE.md. Requirements remain active if evidence is stale. For cross-domain work, add every affected path and use legacy reading for unmigrated parts.\n");
    if (result.fallback) console.log("No migrated contract matched. Read PLAN.md, docs/user_manual.md, docs/research_report.md, docs/how_it_works.md, docs/next_features_plan.md and docs/sorare_plan.md, then search source/tests. Do not infer coverage from an empty lookup.");
    for (const c of result.contracts) {
      console.log(`Matched ${c.id}: ${c.reason}; ${c.status}; source review ${c.review?.date}\n${c.text}\n`);
      console.log("Evidence: " + [...c.sources, ...c.tests].map(r => `${r.path}${r.symbol ? ` :: ${r.symbol}` : r.case ? ` :: ${r.case}` : ""}`).join("\n") + "\n");
    }
    const all = parseDocument(body).contracts;
    const stale = validate(ROOT, body).filter(e =>
      !all.some(c => e.startsWith(`${c.id}:`)) || result.contracts.some(c => e.startsWith(`${c.id}:`)));
    if (stale.length) { console.error(stale.join("\n")); process.exitCode = 1; }
  } else if (command === "benchmark") {
    const errors = validate(ROOT, body);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("Static routing only; not a task-performance evaluation. Words exclude mandatory AGENTS.md/CLAUDE.md and legacy fallback guides.");
    for (const trial of parseDocument(body).trials) {
      const result = lookup(body, trial.prompt);
      const ids = new Set(result.contracts.map(c => c.id));
      const hits = trial.expected.filter(id => ids.has(id)).length;
      const extra = [...ids].filter(id => !trial.expected.includes(id)).length;
      const words = result.contracts.map(c => c.text + " " + [...c.sources, ...c.tests].map(r => Object.values(r).join(" ")).join(" ")).join(" ").trim().split(/\s+/).filter(Boolean).length;
      console.log(`${hits}/${trial.expected.length} required, ${extra} extra, ${words} words, fallback=${result.fallback}: ${trial.prompt}`);
    }
  } else if (command === "index") {
    if (!INDEX.test(body)) throw new Error("Missing inventory markers");
    writeFileSync(resolve(ROOT, REFERENCE), body.replace(INDEX, inventory(ROOT, filesInRepo())));
    console.log("Updated static inventory; no source review or verification claim changed.");
  } else if (command === "review") {
    const [id, ...words] = args;
    if (!id || !words.length) throw new Error('Usage: node scripts/docs.mjs review CONTRACT-ID "what was inspected and any limits"');
    const registry = parseDocument(body);
    const contract = registry.contracts.find(c => c.id === id);
    if (!contract) throw new Error(`Unknown contract ${id}`);
    contract.review = { date: new Date().toISOString().slice(0, 10), note: words.join(" "), files: {} };
    for (const ref of [...contract.sources, ...contract.tests]) {
      if (!inside(ROOT, ref.path)) throw new Error(`Outside repository: ${ref.path}`);
      contract.review.files[ref.path] = digest(ROOT, ref.path);
    }
    body = body.replace(REGISTRY, () => "```json context-registry\n" + JSON.stringify(registry, null, 2) + "\n```");
    writeFileSync(resolve(ROOT, REFERENCE), body);
    console.log(`Recorded source review for ${id}; does not claim tests ran or behavior is correct. Run check and inspect the diff.`);
  } else if (command === "check") {
    const errors = validate(ROOT, body);
    const generated = inventory(ROOT, filesInRepo());
    if (body.match(INDEX)?.[0] !== generated) errors.push("Route/table inventory drift: run node scripts/docs.mjs index; review new surfaces and routing coverage.");
    for (const path of [REFERENCE, "docs/documentation_audit.md", "AGENTS.md", "CLAUDE.md"]) {
      if (existsSync(resolve(ROOT, path))) errors.push(...checkLinks(ROOT, read(ROOT, path), path));
    }
    if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
    else console.log(`Documentation: ${parseDocument(body).contracts.length} contracts, source/test references, retrieval cases, routed-document links and route/table inventory pass. No product tests or task-performance trials are implied.`);
  } else throw new Error(`Unknown command ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
