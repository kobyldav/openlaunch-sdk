import type { HttpClient } from "../http.js";
import type { ListOptions, Paginated, Query } from "../types.js";
import { clampLimit } from "../utils.js";

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
}
