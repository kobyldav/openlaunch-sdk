import type { HttpClient } from "../http.js";
import type { ListOptions, Paginated, Query } from "../types.js";
import { clampLimit, isRecord } from "../utils.js";

export class RawResource<T = Record<string, unknown>> {
  constructor(private readonly http: HttpClient, readonly endpoint: string) {}

  async list(options: ListOptions = {}): Promise<Paginated<T>> {
    const query: Query = {
      limit: clampLimit(options.limit), offset: options.offset, search: options.search,
      ordering: options.ordering, mode: options.mode, ...(options.filters ?? {}),
    };
    return this.http.get<Paginated<T>>(`${this.endpoint}/`, query);
  }

  async get(id: string | number, mode: ListOptions["mode"] = "detailed"): Promise<T> {
    return this.http.get<T>(`${this.endpoint}/${encodeURIComponent(String(id))}/`, { mode });
  }

  async *iterate(options: ListOptions & { maxItems?: number; pageSize?: number } = {}): AsyncGenerator<T, void, void> {
    const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
    const pageSize = clampLimit(options.pageSize ?? options.limit ?? 100) ?? 100;
    let offset = options.offset ?? 0;
    let emitted = 0;
    while (emitted < maxItems) {
      const page = await this.list({ ...options, limit: pageSize, offset });
      for (const item of page.results) {
        yield item;
        emitted++;
        if (emitted >= maxItems) return;
      }
      if (!page.next || page.results.length === 0) return;
      offset += page.results.length;
    }
  }

  async all(options: ListOptions & { maxItems?: number; pageSize?: number } = {}): Promise<T[]> {
    const result: T[] = [];
    for await (const item of this.iterate(options)) result.push(item);
    return result;
  }

  async count(options: Omit<ListOptions, "limit" | "offset"> = {}): Promise<number> {
    const page = await this.list({ ...options, limit: 1, offset: 0 });
    return page.count;
  }

  async action<TOut = unknown>(suffix: string, query: Query = {}): Promise<TOut> {
    return this.http.get<TOut>(`${this.endpoint}/${suffix.replace(/^\//, "")}`, query);
  }
}

export class ConfigResource<T = Record<string, unknown>> {
  constructor(private readonly http: HttpClient, readonly endpoint: string) {}
  async list(): Promise<T[]> {
    const raw = await this.http.get<unknown>(`${this.endpoint}/`);
    if (Array.isArray(raw)) return raw as T[];
    if (isRecord(raw) && Array.isArray(raw.results)) return raw.results as T[];
    return [];
  }
}
