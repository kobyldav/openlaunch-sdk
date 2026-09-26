"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCache = void 0;
class MemoryCache {
    entries = new Map();
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
        this.entries.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
    }
    delete(key) { this.entries.delete(key); }
    clear() { this.entries.clear(); }
}
exports.MemoryCache = MemoryCache;
//# sourceMappingURL=cache.js.map