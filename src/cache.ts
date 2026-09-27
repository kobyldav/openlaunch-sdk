export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined> | T | undefined;
  set<T>(key: string, value: T, ttlMs: number): Promise<void> | void;
  delete?(key: string): Promise<void> | void;
  clear?(): Promise<void> | void;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCache implements CacheAdapter {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly maxEntries = 1_000) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const first = this.entries.keys().next().value as string | undefined;
      if (first !== undefined) this.entries.delete(first);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
  }

  delete(key: string): void { this.entries.delete(key); }
  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}

export class NullCache implements CacheAdapter {
  get<T>(_key: string): T | undefined { return undefined; }
  set<T>(_key: string, _value: T, _ttlMs: number): void {}
  delete(_key: string): void {}
  clear(): void {}
}

export class PrefixCache implements CacheAdapter {
  constructor(private readonly inner: CacheAdapter, private readonly prefix: string) {}
  get<T>(key: string): Promise<T | undefined> | T | undefined { return this.inner.get<T>(`${this.prefix}${key}`); }
  set<T>(key: string, value: T, ttlMs: number): Promise<void> | void { return this.inner.set(`${this.prefix}${key}`, value, ttlMs); }
  delete(key: string): Promise<void> | void { return this.inner.delete?.(`${this.prefix}${key}`); }
  clear(): Promise<void> | void { return this.inner.clear?.(); }
}

export class TieredCache implements CacheAdapter {
  constructor(private readonly tiers: readonly CacheAdapter[]) {}

  async get<T>(key: string): Promise<T | undefined> {
    for (let index = 0; index < this.tiers.length; index++) {
      const tier = this.tiers[index]!;
      const value = await tier.get<T>(key);
      if (value !== undefined) {
        for (let warm = 0; warm < index; warm++) await this.tiers[warm]?.set(key, value, 60_000);
        return value;
      }
    }
    return undefined;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await Promise.all(this.tiers.map((tier) => tier.set(key, value, ttlMs)));
  }

  async delete(key: string): Promise<void> { await Promise.all(this.tiers.map((tier) => tier.delete?.(key))); }
  async clear(): Promise<void> { await Promise.all(this.tiers.map((tier) => tier.clear?.())); }
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem?(key: string): Promise<void> | void;
}

export class JsonStorageCache implements CacheAdapter {
  constructor(private readonly storage: KeyValueStorage, private readonly prefix = "openlaunch:") {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.storage.getItem(`${this.prefix}${key}`);
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as Entry;
      if (Date.now() >= parsed.expiresAt) {
        await this.storage.removeItem?.(`${this.prefix}${key}`);
        return undefined;
      }
      return parsed.value as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.storage.setItem(`${this.prefix}${key}`, JSON.stringify({ value, expiresAt: Date.now() + Math.max(0, ttlMs) }));
  }

  async delete(key: string): Promise<void> { await this.storage.removeItem?.(`${this.prefix}${key}`); }
}
