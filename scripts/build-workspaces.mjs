/**
 * Generate genuinely installable, independently packed workspaces from the
 * existing v1 source tree. Transitive imports are traced from the compiled
 * ESM/CommonJS + .d.ts graphs; modules outside a package's closure are NOT
 * copied to it. Shared SDK infrastructure is externalized to @openlaunch/core.
 *
 * This incremental "strangler" migration deliberately leaves openlaunch-sdk
 * and its existing imports/API untouched during v1.1 adoption.
 */
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { posix as path } from "node:path";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const rootPath = (...p) => join(root, ...p);
const types = ["esm", "cjs", "types"];
const dependencyPattern = /(["'])(\.{1,2}\/[^"'\s]+\.js)\1/g;

// Public entrypoints point to narrowly selected domain functionality.
// Keep the monolith OpenLaunch class ONLY in openlaunch-sdk, never export
// src/client.js from modular packages (that class loads every subsystem).
const packages = {
  core: {
    entries: ["cache", "errors", "http", "query", "types", "utils", "mappers", "resources/base", "resources/raw", "resources/generic"],
  },
  earth: {
    entries: ["geo/index", "providers/stac", "providers/copernicus", "providers/planetary-computer", "providers/openmeteo", "intelligence/observations", "eo/products", "eo/scenes", "eo/download"],
  },
  raster: {
    entries: ["eo/index", "geo/index"],
  },
  launches: {
    entries: ["providers/ll2", "providers/nasa", "resources/launches", "resources/agencies", "resources/rockets", "resources/astronauts", "resources/events", "resources/pads"],
  },
  orbit: {
    entries: ["orbit/index", "traffic/index", "sensors/index", "scenario/index", "providers/celestrak"],
  },
  engineering: {
    entries: ["science/index", "trajectory/index", "mission/index"],
  },
};

const coreModules = new Set(packages.core.entries);
const orbitPrefixes = ["orbit/", "traffic/", "sensors/", "scenario/"];
const orbitEntries = new Set(packages.orbit.entries);
const mapping = (packageName, file) => {
  if (packageName !== "core" && coreModules.has(file)) return "core";
  if (packageName === "engineering" && (orbitPrefixes.some(p=>file.startsWith(p)) || file === "providers/celestrak")) return "orbit";
  return null;
};
const outputSource = {
  esm: (module) => rootPath("dist", module + ".js"),
  cjs: (module) => rootPath("dist-cjs", module + ".js"),
  types: (module) => rootPath("dist", module + ".d.ts"),
};
const distOutput = (pkg, kind, module) => rootPath("packages", pkg, "dist", kind, module + (kind === "types" ? ".d.ts" : ".js"));
const ensureInside = name => {
  if (!name || name.startsWith("/") || name.split("/").some(part => part === ".." || part === ".") || !/^[a-z0-9_./-]+$/.test(name)) throw new Error("Invalid imported module path " + name);
};
function dependencyFrom(module, specifier) {
  // Same source relative resolution holds in dist/esm and dist/cjs.
  if (!specifier.startsWith(".")) return null;
  const next = path.normalize(path.join(path.dirname(module), specifier));
  if (!next.endsWith(".js")) throw new Error("Expected .js module import: " + next);
  const bare = next.slice(0, -3);
  ensureInside(bare);
  return bare;
}
function externalSpecifier(owner, module) {
  // This is a package export subpath to an independently installable module.
  return `@openlaunch/${owner}/internal/${module}`;
}
async function readIfExists(file) {
  try { return await readFile(file, "utf8"); }
  catch(error){ if(error.code === "ENOENT") return null; throw error; }
}
async function build(pkg) {
  const definition = packages[pkg];
  const target = rootPath("packages", pkg, "dist");
  await writeFile(rootPath("packages",pkg,"LICENSE"),await readFile(rootPath("LICENSE"),"utf8"));
  await rm(target, {recursive:true,force:true});
  for (const kind of types) await mkdir(join(target,kind),{recursive:true});
  await writeFile(join(target, "cjs", "package.json"), '{"type":"commonjs"}\n');
  let count = 0, sum = 0, rewritten = 0;
  const seen = new Set();
  const queue = [...definition.entries];
  for(let head=0;head<queue.length;head++){
    const mod=queue[head];
    ensureInside(mod);
    if(seen.has(mod))continue;
    const external = mapping(pkg,mod);
    if(external)throw new Error("Public entry is owned by " + external + " not " + pkg + ": " + mod);
    seen.add(mod);count++;
    for(const kind of types){
      const input = outputSource[kind](mod);
      let code = await readIfExists(input);
      if(code === null)throw new Error("Missing compiled " + kind + " module: " + input);
      code = code.replace(dependencyPattern, (full, quote, spec) => {
        const dep = dependencyFrom(mod,spec);
        if(dep===null)return full;
        const owner=mapping(pkg,dep);
        if(owner){
          rewritten++;
          return quote + externalSpecifier(owner,dep) + quote;
        }
        queue.push(dep);
        return full;
      });
      const outfile = distOutput(pkg,kind,mod);
      await mkdir(path.dirname(outfile),{recursive:true});
      await writeFile(outfile,code);
      sum+=Buffer.byteLength(code);
    }
  }
  const esmExports=definition.entries.map(e=>`export * from "./${e}.js";`).join("\n")+"\n";
  const cjsExports=definition.entries.map(e=>`Object.assign(exports, require("./${e}.js"));`).join("\n")+"\n";
  const typeExports=definition.entries.map(e=>`export * from "./${e}.js";`).join("\n")+"\n";
  await writeFile(join(target,"esm","index.js"),esmExports);
  await writeFile(join(target,"cjs","index.js"),cjsExports);
  await writeFile(join(target,"types","index.d.ts"),typeExports);
  sum+=Buffer.byteLength(esmExports)+Buffer.byteLength(cjsExports)+Buffer.byteLength(typeExports);
  return {pkg,modules:count,bytes:sum,externalizedReferences:rewritten};
}
const report=[];
for (const pkg of Object.keys(packages)) report.push(await build(pkg));
for(const p of report) console.log(`@openlaunch/${p.pkg}: ${p.modules} compiled modules, ${(p.bytes/1024).toFixed(1)} KiB uncompressed, ${p.externalizedReferences} cross-package refs`);
await writeFile(rootPath("packages","build-report.json"),JSON.stringify(report,null,2)+"\n");
