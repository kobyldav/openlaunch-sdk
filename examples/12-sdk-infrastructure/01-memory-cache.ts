/**
 * Use MemoryCache directly
 *
 * The cache adapter can be used and tested independently of HTTP.
 *
 * Uses: MemoryCache
 * Network: no
 */
import { MemoryCache } from "../../src/index.js";

const cache = new MemoryCache(100);
await cache.set("answer", { value: 42 }, 60_000);
console.log(await cache.get<{ value: number }>("answer"));
await cache.delete("answer");
