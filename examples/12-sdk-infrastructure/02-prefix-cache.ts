/**
 * Namespace cache keys
 *
 * PrefixCache creates logical namespaces on top of a shared adapter.
 *
 * Uses: MemoryCache, PrefixCache
 * Network: no
 */
import { MemoryCache, PrefixCache } from "../../src/index.js";

const shared = new MemoryCache();
const launches = new PrefixCache(shared, "launches:");
const nasa = new PrefixCache(shared, "nasa:");
await launches.set("latest", "A", 60_000);
await nasa.set("latest", "B", 60_000);
console.log(await launches.get("latest"), await nasa.get("latest"));
