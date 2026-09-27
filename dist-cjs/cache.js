"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonStorageCache = exports.TieredCache = exports.PrefixCache = exports.NullCache = exports.MemoryCache = void 0;
class MemoryCache {
    maxEntries;
    entries = new Map();
    constructor(maxEntries = 1_000) {
        this.maxEntries = maxEntries;
    }
    get(key) {
        const entry = this.entries.get(key);
        if (!entry)
            return undefined;
        if (Date.now() >= entry.expiresAt) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlMs) {
        if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
            const first = this.entries.keys().next().value;
            if (first !== undefined)
                this.entries.delete(first);
        }
        this.entries.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
    }
    delete(key) { this.entries.delete(key); }
    clear() { this.entries.clear(); }
    get size() { return this.entries.size; }
}
exports.MemoryCache = MemoryCache;
class NullCache {
    get(_key) { return undefined; }
    set(_key, _value, _ttlMs) { }
    delete(_key) { }
    clear() { }
}
exports.NullCache = NullCache;
class PrefixCache {
    inner;
    prefix;
    constructor(inner, prefix) {
        this.inner = inner;
        this.prefix = prefix;
    }
    get(key) { return this.inner.get(`${this.prefix}${key}`); }
    set(key, value, ttlMs) { return this.inner.set(`${this.prefix}${key}`, value, ttlMs); }
    delete(key) { return this.inner.delete?.(`${this.prefix}${key}`); }
    clear() { return this.inner.clear?.(); }
}
exports.PrefixCache = PrefixCache;
class TieredCache {
    tiers;
    constructor(tiers) {
        this.tiers = tiers;
    }
    async get(key) {
        for (let index = 0; index < this.tiers.length; index++) {
            const tier = this.tiers[index];
            const value = await tier.get(key);
            if (value !== undefined) {
                for (let warm = 0; warm < index; warm++)
                    await this.tiers[warm]?.set(key, value, 60_000);
                return value;
            }
        }
        return undefined;
    }
    async set(key, value, ttlMs) {
        await Promise.all(this.tiers.map((tier) => tier.set(key, value, ttlMs)));
    }
    async delete(key) { await Promise.all(this.tiers.map((tier) => tier.delete?.(key))); }
    async clear() { await Promise.all(this.tiers.map((tier) => tier.clear?.())); }
}
exports.TieredCache = TieredCache;
class JsonStorageCache {
    storage;
    prefix;
    constructor(storage, prefix = "openlaunch:") {
        this.storage = storage;
        this.prefix = prefix;
    }
    async get(key) {
        const raw = await this.storage.getItem(`${this.prefix}${key}`);
        if (!raw)
            return undefined;
        try {
            const parsed = JSON.parse(raw);
            if (Date.now() >= parsed.expiresAt) {
                await this.storage.removeItem?.(`${this.prefix}${key}`);
                return undefined;
            }
            return parsed.value;
        }
        catch {
            return undefined;
        }
    }
    async set(key, value, ttlMs) {
        await this.storage.setItem(`${this.prefix}${key}`, JSON.stringify({ value, expiresAt: Date.now() + Math.max(0, ttlMs) }));
    }
    async delete(key) { await this.storage.removeItem?.(`${this.prefix}${key}`); }
}
exports.JsonStorageCache = JsonStorageCache;
//# sourceMappingURL=cache.js.map