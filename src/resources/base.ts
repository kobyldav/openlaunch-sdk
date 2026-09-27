import type { HttpClient } from "../http.js";
import type { ListOptions, Paginated, Query } from "../types.js";
import { clampLimit } from "../utils.js";

export interface CollectOptions extends ListOptions {
  maxItems?: number;
  pageSize?: number;
}

export abstract class BaseResource<T> {
  constructor(protected readonly http: HttpClient, protected readonly endpoint: string) {}
  protected abstract map(raw: unknown): T;

  protected query(options: ListOptions = {}): Query {
    return {
      limit: clampLimit(options.limit), offset: options.offset, search: options.search,
      ordering: options.ordering, mode: options.mode, ...(options.filters ?? {}),
    };
  }

  async list(options: ListOptions = {}): Promise<Paginated<T>> {
    const raw = await this.http.get<Paginated<unknown>>(`${this.endpoint}/`, this.query(options));
    return { ...raw, results: raw.results.map((item) => this.map(item)) };
  }

  async get(id: string | number, mode: ListOptions["mode"] = "detailed"): Promise<T> {
    const raw = await this.http.get<unknown>(`${this.endpoint}/${encodeURIComponent(String(id))}/`, { mode });
    return this.map(raw);
  }

  async search(search: string, options: Omit<ListOptions, "search"> = {}): Promise<Paginated<T>> {
    return this.list({ ...options, search });
  }

  async *iterate(options: CollectOptions = {}): AsyncGenerator<T, void, void> {
    const pageSize = clampLimit(options.pageSize ?? options.limit ?? 100) ?? 100;
    const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
    let offset = options.offset ?? 0;
    let emitted = 0;
    while (emitted < maxItems) {
      const page = await this.list({ ...options, limit: pageSize, offset });
      if (page.results.length === 0) return;
      for (const item of page.results) {
        yield item;
        emitted++;
        if (emitted >= maxItems) return;
      }
      if (!page.next || page.results.length < pageSize) return;
      offset += page.results.length;
    }
  }

  async all(options: CollectOptions = {}): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this.iterate(options)) items.push(item);
    return items;
  }

  async first(options: ListOptions = {}): Promise<T | null> {
    const page = await this.list({ ...options, limit: 1, offset: 0 });
    return page.results[0] ?? null;
  }

  async count(options: Omit<ListOptions, "limit" | "offset"> = {}): Promise<number> {
    const page = await this.list({ ...options, limit: 1, offset: 0 });
    return page.count;
  }
}
