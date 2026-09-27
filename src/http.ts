import type { CacheAdapter } from "./cache.js";
import { CircuitOpenError, HttpError, RateLimitError, TimeoutError } from "./errors.js";
import type { Query } from "./types.js";
import { params, sleep } from "./utils.js";

export type HttpTelemetryEvent =
  | { type: "request"; method: string; url: string; attempt: number }
  | { type: "response"; method: string; url: string; status: number; durationMs: number; cached: boolean }
  | { type: "retry"; method: string; url: string; attempt: number; delayMs: number; error: unknown }
  | { type: "error"; method: string; url: string; durationMs: number; error: unknown }
  | { type: "cache-hit"; method: string; url: string };

export interface HttpClientOptions {
  baseUrl: string;
  fetchImpl: typeof fetch;
  cache?: CacheAdapter;
  cacheTtlMs: number;
  retries: number;
  retryDelayMs: number;
  timeoutMs?: number;
  headers: Record<string, string>;
  maxConcurrency?: number;
  minRequestIntervalMs?: number;
  deduplicate?: boolean;
  circuitBreaker?: { failureThreshold: number; cooldownMs: number } | false;
  onTelemetry?: (event: HttpTelemetryEvent) => void;
}

export interface RequestOptions {
  query?: Query;
  cacheTtlMs?: number;
  bypassCache?: boolean;
  timeoutMs?: number;
  retry?: boolean;
}

class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    return () => this.release();
  }
  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.waiting.shift()?.();
  }
}

export class HttpClient {
  private readonly semaphore: Semaphore;
  private readonly inflight = new Map<string, Promise<unknown>>();
  private lastRequestAt = 0;
  private consecutiveFailures = 0;
  private circuitOpenedAt = 0;

  constructor(private readonly options: HttpClientOptions) {
    this.semaphore = new Semaphore(Math.max(1, options.maxConcurrency ?? 6));
  }

  get baseUrl(): string { return this.options.baseUrl; }

  get<T>(path: string, query: Query = {}, init: RequestInit = {}, requestOptions: Omit<RequestOptions, "query"> = {}): Promise<T> {
    return this.request<T>("GET", path, init, { ...requestOptions, query });
  }

  async request<T>(method: string, path: string, init: RequestInit = {}, requestOptions: RequestOptions = {}): Promise<T> {
    const url = this.url(path, requestOptions.query ?? {});
    const key = `${method.toUpperCase()}:${url.toString()}`;
    const useCache = method.toUpperCase() === "GET" && !requestOptions.bypassCache;

    if (useCache) {
      const cached = await this.options.cache?.get<T>(key);
      if (cached !== undefined) {
        this.options.onTelemetry?.({ type: "cache-hit", method, url: url.toString() });
        this.options.onTelemetry?.({ type: "response", method, url: url.toString(), status: 200, durationMs: 0, cached: true });
        return cached;
      }
      if (this.options.deduplicate !== false) {
        const pending = this.inflight.get(key);
        if (pending) return pending as Promise<T>;
      }
    }

    const operation = this.execute<T>(method.toUpperCase(), url, init, requestOptions);
    if (useCache && this.options.deduplicate !== false) this.inflight.set(key, operation);
    try {
      const value = await operation;
      if (useCache) await this.options.cache?.set(key, value, requestOptions.cacheTtlMs ?? this.options.cacheTtlMs);
      return value;
    } finally {
      if (useCache) this.inflight.delete(key);
    }
  }

  private async execute<T>(method: string, url: URL, init: RequestInit, requestOptions: RequestOptions): Promise<T> {
    this.assertCircuit();
    const release = await this.semaphore.acquire();
    try {
      await this.waitForRateSlot();
      const maxRetries = requestOptions.retry === false ? 0 : this.options.retries;
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const started = Date.now();
        const controller = new AbortController();
        const timeoutMs = requestOptions.timeoutMs ?? this.options.timeoutMs ?? 30_000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const externalSignal = init.signal;
        const abortExternal = () => controller.abort();
        externalSignal?.addEventListener("abort", abortExternal, { once: true });
        try {
          this.options.onTelemetry?.({ type: "request", method, url: url.toString(), attempt });
          const response = await this.options.fetchImpl(url, {
            ...init,
            method,
            signal: controller.signal,
            headers: { Accept: "application/json", ...this.options.headers, ...(init.headers ?? {}) },
          });
          const body = await this.readBody(response);
          if (!response.ok) {
            if (response.status === 429) {
              const retryHeader = response.headers.get("retry-after");
              const retryAfterSeconds = retryHeader ? Number(retryHeader) : undefined;
              throw new RateLimitError(
                response.statusText,
                url.toString(),
                body,
                Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
              );
            }
            throw new HttpError(response.status, response.statusText, url.toString(), body);
          }
          this.consecutiveFailures = 0;
          this.circuitOpenedAt = 0;
          this.options.onTelemetry?.({ type: "response", method, url: url.toString(), status: response.status, durationMs: Date.now() - started, cached: false });
          return body as T;
        } catch (error) {
          const normalized = controller.signal.aborted && !externalSignal?.aborted
            ? new TimeoutError(timeoutMs, url.toString())
            : error;
          lastError = normalized;
          const retryable = this.isRetryable(normalized);
          if (!retryable || attempt >= maxRetries) {
            this.recordFailure(normalized);
            this.options.onTelemetry?.({ type: "error", method, url: url.toString(), durationMs: Date.now() - started, error: normalized });
            throw normalized;
          }
          const retryAfter = normalized instanceof RateLimitError ? normalized.retryAfterSeconds : undefined;
          const exponential = this.options.retryDelayMs * Math.pow(2, attempt);
          const jitter = exponential * (0.15 * Math.random());
          const delay = retryAfter !== undefined ? retryAfter * 1000 : exponential + jitter;
          this.options.onTelemetry?.({ type: "retry", method, url: url.toString(), attempt: attempt + 1, delayMs: delay, error: normalized });
          await sleep(delay);
        } finally {
          clearTimeout(timer);
          externalSignal?.removeEventListener("abort", abortExternal);
        }
      }
      throw lastError;
    } finally {
      release();
    }
  }

  private url(path: string, query: Query): URL {
    const absolute = /^https?:\/\//i.test(path);
    const base = this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`;
    const url = absolute ? new URL(path) : new URL(path.replace(/^\//, ""), base);
    const search = params(query);
    search.forEach((value, key) => url.searchParams.set(key, value));
    return url;
  }

  private async readBody(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json") || text.startsWith("{") || text.startsWith("[")) {
      try { return JSON.parse(text); } catch { /* fall through */ }
    }
    return text;
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof RateLimitError || error instanceof TimeoutError ||
      (error instanceof HttpError && error.status >= 500) || error instanceof TypeError;
  }

  private async waitForRateSlot(): Promise<void> {
    const interval = Math.max(0, this.options.minRequestIntervalMs ?? 0);
    const now = Date.now();
    const wait = this.lastRequestAt + interval - now;
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private assertCircuit(): void {
    const config = this.options.circuitBreaker;
    if (!config || this.circuitOpenedAt === 0) return;
    const retryAt = this.circuitOpenedAt + config.cooldownMs;
    if (Date.now() < retryAt) throw new CircuitOpenError(new Date(retryAt));
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = 0;
  }

  private recordFailure(error: unknown): void {
    const config = this.options.circuitBreaker;
    if (!config || !this.isRetryable(error)) return;
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= config.failureThreshold) this.circuitOpenedAt = Date.now();
  }
}
