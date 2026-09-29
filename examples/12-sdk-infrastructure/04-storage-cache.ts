/**
 * Adapt key/value storage to the SDK cache
 *
 * Wrap browser-like or app storage behind JsonStorageCache without coupling OpenLaunch to a specific storage library.
 *
 * Uses: JsonStorageCache, KeyValueStorage
 * Network: no
 */
import { JsonStorageCache, type KeyValueStorage } from "../../src/index.js";

const memory = new Map<string, string>();
const storage: KeyValueStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, value); },
  removeItem: (key) => { memory.delete(key); },
};
const cache = new JsonStorageCache(storage, "demo:");
await cache.set("x", [1, 2, 3], 60_000);
console.log(await cache.get<number[]>("x"));
