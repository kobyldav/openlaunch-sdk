import { OpenLaunch } from "../dist/index.js";

const sdk = new OpenLaunch({ retries: 0, cacheTtlMs: 600_000 });
let failed = 0;
async function test(name, fn) {
  try { const value = await fn(); console.log(`✅ ${name}`, value); }
  catch (error) { failed++; console.error(`❌ ${name}`, error); }
}
await test("next launch", async () => { const x = await sdk.launches.next(); return x ? `${x.name} @ ${x.net.toISOString()}` : "none"; });
await test("LL2 throttle", () => sdk.throttle());
await test("CelesTrak ISS OMM", async () => (await sdk.celestrak.byCatalogNumber(25544))[0]?.OBJECT_NAME ?? "none");
console.log(failed ? `FAILED: ${failed}` : "All live smoke tests passed");
process.exitCode = failed ? 1 : 0;
