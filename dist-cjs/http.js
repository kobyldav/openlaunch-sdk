"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
const errors_js_1 = require("./errors.js");
const utils_js_1 = require("./utils.js");
class Semaphore {
    max;
    active = 0;
    waiting = [];
    constructor(max) {
        this.max = max;
    }
    async acquire() {
        if (this.active < this.max) {
            this.active++;
            return () => this.release();
        }
        await new Promise((resolve) => this.waiting.push(resolve));
        this.active++;
        return () => this.release();
    }
    release() {
        this.active = Math.max(0, this.active - 1);
        this.waiting.shift()?.();
    }
}
class HttpClient {
    options;
    semaphore;
    inflight = new Map();
    lastRequestAt = 0;
    consecutiveFailures = 0;
    circuitOpenedAt = 0;
    constructor(options) {
        this.options = options;
        this.semaphore = new Semaphore(Math.max(1, options.maxConcurrency ?? 6));
    }
    get baseUrl() { return this.options.baseUrl; }
    get(path, query = {}, init = {}, requestOptions = {}) {
        return this.request("GET", path, init, { ...requestOptions, query });
    }
    async request(method, path, init = {}, requestOptions = {}) {
        const url = this.url(path, requestOptions.query ?? {});
        const key = `${method.toUpperCase()}:${url.toString()}`;
        const useCache = method.toUpperCase() === "GET" && !requestOptions.bypassCache;
        if (useCache) {
            const cached = await this.options.cache?.get(key);
            if (cached !== undefined) {
                this.options.onTelemetry?.({ type: "cache-hit", method, url: url.toString() });
                this.options.onTelemetry?.({ type: "response", method, url: url.toString(), status: 200, durationMs: 0, cached: true });
                return cached;
            }
            if (this.options.deduplicate !== false) {
                const pending = this.inflight.get(key);
                if (pending)
                    return pending;
            }
        }
        const operation = this.execute(method.toUpperCase(), url, init, requestOptions);
        if (useCache && this.options.deduplicate !== false)
            this.inflight.set(key, operation);
        try {
            const value = await operation;
            if (useCache)
                await this.options.cache?.set(key, value, requestOptions.cacheTtlMs ?? this.options.cacheTtlMs);
            return value;
        }
        finally {
            if (useCache)
                this.inflight.delete(key);
        }
    }
    async execute(method, url, init, requestOptions) {
        this.assertCircuit();
        const release = await this.semaphore.acquire();
        try {
            await this.waitForRateSlot();
            const maxRetries = requestOptions.retry === false ? 0 : this.options.retries;
            let lastError;
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
                            throw new errors_js_1.RateLimitError(response.statusText, url.toString(), body, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined);
                        }
                        throw new errors_js_1.HttpError(response.status, response.statusText, url.toString(), body);
                    }
                    this.consecutiveFailures = 0;
                    this.circuitOpenedAt = 0;
                    this.options.onTelemetry?.({ type: "response", method, url: url.toString(), status: response.status, durationMs: Date.now() - started, cached: false });
                    return body;
                }
                catch (error) {
                    const normalized = controller.signal.aborted && !externalSignal?.aborted
                        ? new errors_js_1.TimeoutError(timeoutMs, url.toString())
                        : error;
                    lastError = normalized;
                    const retryable = this.isRetryable(normalized);
                    if (!retryable || attempt >= maxRetries) {
                        this.recordFailure(normalized);
                        this.options.onTelemetry?.({ type: "error", method, url: url.toString(), durationMs: Date.now() - started, error: normalized });
                        throw normalized;
                    }
                    const retryAfter = normalized instanceof errors_js_1.RateLimitError ? normalized.retryAfterSeconds : undefined;
                    const exponential = this.options.retryDelayMs * Math.pow(2, attempt);
                    const jitter = exponential * (0.15 * Math.random());
                    const delay = retryAfter !== undefined ? retryAfter * 1000 : exponential + jitter;
                    this.options.onTelemetry?.({ type: "retry", method, url: url.toString(), attempt: attempt + 1, delayMs: delay, error: normalized });
                    await (0, utils_js_1.sleep)(delay);
                }
                finally {
                    clearTimeout(timer);
                    externalSignal?.removeEventListener("abort", abortExternal);
                }
            }
            throw lastError;
        }
        finally {
            release();
        }
    }
    url(path, query) {
        const absolute = /^https?:\/\//i.test(path);
        const base = this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`;
        const url = absolute ? new URL(path) : new URL(path.replace(/^\//, ""), base);
        const search = (0, utils_js_1.params)(query);
        search.forEach((value, key) => url.searchParams.set(key, value));
        return url;
    }
    async readBody(response) {
        if (response.status === 204)
            return undefined;
        const text = await response.text();
        if (!text)
            return undefined;
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("json") || text.startsWith("{") || text.startsWith("[")) {
            try {
                return JSON.parse(text);
            }
            catch { /* fall through */ }
        }
        return text;
    }
    isRetryable(error) {
        return error instanceof errors_js_1.RateLimitError || error instanceof errors_js_1.TimeoutError ||
            (error instanceof errors_js_1.HttpError && error.status >= 500) || error instanceof TypeError;
    }
    async waitForRateSlot() {
        const interval = Math.max(0, this.options.minRequestIntervalMs ?? 0);
        const now = Date.now();
        const wait = this.lastRequestAt + interval - now;
        if (wait > 0)
            await (0, utils_js_1.sleep)(wait);
        this.lastRequestAt = Date.now();
    }
    assertCircuit() {
        const config = this.options.circuitBreaker;
        if (!config || this.circuitOpenedAt === 0)
            return;
        const retryAt = this.circuitOpenedAt + config.cooldownMs;
        if (Date.now() < retryAt)
            throw new errors_js_1.CircuitOpenError(new Date(retryAt));
        this.consecutiveFailures = 0;
        this.circuitOpenedAt = 0;
    }
    recordFailure(error) {
        const config = this.options.circuitBreaker;
        if (!config || !this.isRetryable(error))
            return;
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= config.failureThreshold)
            this.circuitOpenedAt = Date.now();
    }
}
exports.HttpClient = HttpClient;
//# sourceMappingURL=http.js.map