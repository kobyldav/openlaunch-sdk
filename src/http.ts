import type { CacheAdapter } from "./cache.js";
import { HttpError, RateLimitError } from "./errors.js";
import type { Query } from "./types.js";
import { params, sleep } from "./utils.js";

export interface HttpClientOptions {
  baseUrl: string;
  fetchImpl: typeof fetch;
  cache?: CacheAdapter;
  cacheTtlMs: number;
  retries: number;
  retryDelayMs: number;
  headers: Record<string, string>;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async get<T>(path: string, query: Query = {}, init: RequestInit = {}): Promise<T> {
    const base = this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`;
    const url = new URL(path.replace(/^\//, ""), base);
    const search = params(query);
    search.forEach((value, key) => url.searchParams.set(key, value));
    const cacheKey = `GET:${url.toString()}`;
    const cached = await this.options.cache?.get<T>(cacheKey);
    if (cached !== undefined) return cached;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const response = await this.options.fetchImpl(url, {
          ...init,
          method: "GET",
          headers: { Accept: "application/json", ...this.options.headers, ...(init.headers ?? {}) },
        });

        let body: unknown;
        const text = await response.text();
        if (text) {
          try { body = JSON.parse(text); } catch { body = text; }
        }

        if (!response.ok) {
          if (response.status === 429) {
            const retryHeader = response.headers.get("retry-after");
            const retryAfterSeconds = retryHeader ? Number(retryHeader) : undefined;
            throw new RateLimitError(response.statusText, url.toString(), body,
              Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined);
          }
          throw new HttpError(response.status, response.statusText, url.toString(), body);
        }

        await this.options.cache?.set(cacheKey, body as T, this.options.cacheTtlMs);
        return body as T;
      } catch (error) {
        lastError = error;
        const isRetryable = error instanceof RateLimitError ||
          (error instanceof HttpError && error.status >= 500) ||
          error instanceof TypeError;
        if (!isRetryable || attempt >= this.options.retries) throw error;
        const retryAfter = error instanceof RateLimitError ? error.retryAfterSeconds : undefined;
        const delay = retryAfter !== undefined
          ? retryAfter * 1000
          : this.options.retryDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
    throw lastError;
  }
}
