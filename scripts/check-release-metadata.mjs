#!/usr/bin/env node
/** Fail closed before publishing if public npm metadata and release versions are inconsistent. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const umbrella = read("package.json");
const lock = read("package-lock.json");
const folders = ["core", "earth", "orbit", "math", "engineering", "launches", "raster"];
const version = umbrella.version;
const repository = "git+https://github.com/kobyldav/openlaunch-sdk.git";
const issues = "https://github.com/kobyldav/openlaunch-sdk/issues";

assert.match(version, /^\d+\.\d+\.\d+$/);
assert.equal(lock.version, version);
assert.equal(lock.packages[""].version, version);
assert.equal(umbrella.repository?.url, repository);
assert.equal(umbrella.homepage, "https://github.com/kobyldav/openlaunch-sdk#readme");
assert.equal(umbrella.bugs?.url, issues);
const umbrellaReadme = readFileSync(join(root, "README.md"), "utf8");
assert.ok(!/development builds|not yet published to the npm registry|the main release remains v1\.1/i.test(umbrellaReadme));

for (const folder of folders) {
  const pkg = read(`packages/${folder}/package.json`);
  const name = `@openlaunchsdk/${folder}`;
  const readme = readFileSync(join(root, "packages", folder, "README.md"), "utf8");
  const locked = lock.packages[`packages/${folder}`];
  assert.equal(pkg.name, name);
  assert.equal(pkg.version, version, name);
  assert.equal(locked?.version, version, name);
  assert.equal(pkg.repository?.url, repository, name);
  assert.equal(pkg.repository?.directory, `packages/${folder}`, name);
  assert.equal(pkg.bugs?.url, issues, name);
  assert.equal(pkg.publishConfig?.access, "public", name);
  assert.ok(pkg.description?.length >= 30 && pkg.description.length <= 160, name);
  assert.ok(!/temporary package placeholder|staged publishing/i.test(pkg.description), name);
  assert.ok(pkg.keywords?.length >= 3, name);
  assert.equal(readme.split(/\r?\n/)[0], `# ${name} (v${version})`, name);
  assert.ok(!/temporary package placeholder|not yet published|root `openlaunch-sdk` v1\.1 remains/i.test(readme), name);
  for (const [dep, range] of Object.entries(pkg.dependencies || {})) {
    if (!dep.startsWith("@openlaunchsdk/")) continue;
    assert.equal(range, `^${version}`, `${name} => ${dep}`);
    assert.equal(locked.dependencies?.[dep], range, `lockfile: ${name} => ${dep}`);
  }
}
console.log(`PASS npm release metadata: umbrella + ${folders.length} workspaces @ ${version}`);
