#!/usr/bin/env node
/** Safe, explicit npm release for the umbrella and all seven scoped packages. */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const umbrella = read(join(root, "package.json"));
const scoped = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => read(join(root, "packages", item.name, "package.json")));
const byName = new Map(scoped.map((pkg) => [pkg.name, pkg]));
const version = umbrella.version;
const mode = process.argv[2] || "--plan";
const modes = new Set(["--plan", "--publish", "--verify", "--promote"]);

function fail(message) { throw new Error(message); }
function execute(command, args, cwd = root) {
  console.log("\n$ " + command + " " + args.join(" "));
  const r = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (r.error || r.status !== 0) fail(command + " failed: " + (r.status ?? r.error?.message));
}
function capture(command, args) {
  const r = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (r.error || r.status !== 0) fail(command + " " + args.join(" ") + ": " + (r.stderr || r.error?.message || r.stdout).trim());
  return r.stdout.trim();
}
if (!modes.has(mode) || process.argv.length > 3) fail("Usage: node scripts/release-npm.mjs [--plan|--publish|--verify|--promote]");
if (umbrella.name !== "openlaunch-sdk" || scoped.length !== 7) fail("Unexpected package set");
for (const pkg of scoped) {
  if (!pkg.name.startsWith("@openlaunch/") || pkg.private || pkg.version !== version) fail("Invalid workspace name/version: " + pkg.name);
  for (const [name, range] of Object.entries(pkg.dependencies || {})) {
    if (name.startsWith("@openlaunch/") && (!byName.has(name) || range !== "^" + version)) fail(pkg.name + " has mismatched dependency " + name + "@" + range);
  }
}
const visiting = new Set(), visited = new Set(), sorted = [];
function visit(name) {
  if (visited.has(name)) return;
  if (visiting.has(name)) fail("Circular workspace dependencies: " + name);
  visiting.add(name);
  for (const dep of Object.keys(byName.get(name).dependencies || {})) if (byName.has(dep)) visit(dep);
  visiting.delete(name); visited.add(name); sorted.push(name);
}
for (const name of [...byName.keys()].sort()) visit(name);
const all = [...sorted, umbrella.name];
console.log("OpenLaunch npm " + version + " (" + mode + ")");
all.forEach((name, i) => console.log((i + 1) + ". " + name + "@" + version));

function ensureMain() {
  const branch = capture("git", ["branch", "--show-current"]);
  if (branch !== "main") fail("Current branch is " + branch + ", not main. Run git switch main && git pull --ff-only origin main");
  if (capture("git", ["status", "--porcelain"])) fail("Git working tree is dirty; commit or stash changes");
  if (capture("git", ["rev-parse", "HEAD"]) !== capture("git", ["rev-parse", "origin/main"])) fail("HEAD differs from origin/main; fetch and fast-forward main first");
}
function ensureRegistry() {
  if (capture("npm", ["config", "get", "registry"]).replace(/\/+$/, "") !== "https://registry.npmjs.org") fail("npm registry is not registry.npmjs.org");
}
function ensureLogin() { console.log("Publishing as npm user: " + capture("npm", ["whoami"])); }
function remoteVersion(name) {
  const r = spawnSync("npm", ["view", name + "@" + version, "version", "--json", "--registry=https://registry.npmjs.org/"], { cwd: root, encoding: "utf8" });
  if (r.error) fail(r.error.message);
  if (r.status === 0) return JSON.parse(r.stdout.trim());
  const msg = r.stderr + "\n" + r.stdout;
  if (/E404|404 Not Found|ENOVERSIONS/i.test(msg)) return null;
  fail("npm registry query failed for " + name + ": " + msg);
}
function verify() {
  ensureRegistry();
  for (const name of all) if (remoteVersion(name) !== version) fail("Not published: " + name + "@" + version);
  const consumer = mkdtempSync(join(tmpdir(), "openlaunch-npm-"));
  try {
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "openlaunch-external-smoke", private: true, version: "1.0.0", type: "module" }));
    execute("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--save-exact", ...all.map((name) => name + "@" + version)], consumer);
    const smoke = "import {createRequire} from 'node:module';\n" +
      "const require=createRequire(process.cwd()+'/consumer.cjs');\n" +
      "for(const name of " + JSON.stringify(all) + ") {\n" +
      "const esm=await import(name); const cjs=require(name);\n" +
      "if(!Object.keys(esm).length||!Object.keys(cjs).length) throw Error(name+' has no exports');\n" +
      "console.log('PASS external ESM/CJS '+name);\n}\n";
    writeFileSync(join(consumer, "verify.mjs"), smoke);
    execute("node", ["verify.mjs"], consumer);
  } finally { rmSync(consumer, { recursive: true, force: true }); }
}

if (mode === "--plan") {
  console.log("\nNo publishing performed. Verify ownership of npm @openlaunch first.");
  console.log("Next: npm login; git switch main; git pull --ff-only origin main; node scripts/release-npm.mjs --publish");
} else if (mode === "--publish") {
  ensureMain(); ensureRegistry(); ensureLogin();
  for (const name of all) if (remoteVersion(name) !== null) fail(name + "@" + version + " already exists; resolve partial releases manually");
  execute("npm", ["ci", "--no-audit", "--no-fund"]);
  execute("npm", ["run", "check"]);
  execute("npm", ["run", "pack:check:packages"]);
  execute("npm", ["run", "test:packed"]);
  execute("npm", ["pack", "--dry-run", "--workspaces=false"]);
  for (const name of sorted) execute("npm", ["publish", "--workspace=" + name, "--access=public", "--tag=next"]);
  execute("npm", ["publish", "--workspaces=false", "--access=public", "--tag=next"]);
  verify();
  console.log("\nAll eight exact npm versions published with tag next; inspect them, then run --promote.");
} else if (mode === "--verify") {
  verify(); console.log("\nAll eight npm packages pass independent registry consumer smoke.");
} else {
  ensureMain(); ensureRegistry(); ensureLogin(); verify();
  for (const name of all) execute("npm", ["dist-tag", "add", name + "@" + version, "latest"]);
  for (const name of all) if (JSON.parse(capture("npm", ["view", name, "dist-tags.latest", "--json"])) !== version) fail("latest tag mismatch: " + name);
  console.log("\nAll eight npm packages now have latest=" + version);
}
