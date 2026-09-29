/**
 * Compose a tiered cache
 *
 * TieredCache checks fast tiers first and warms earlier tiers after a hit.
 *
 * Uses: MemoryCache, TieredCache
 * Network: no
 */
import { MemoryCache, TieredCache } from "../../src/index.js";

const l1 = new MemoryCache(100);
const l2 = new MemoryCache(1_000);
const cache = new TieredCache([l1, l2]);
await cache.set("key", { ok: true }, 60_000);
console.log(await cache.get<{ ok: boolean }>("key"));
