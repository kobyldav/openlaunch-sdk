"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
const errors_js_1 = require("./errors.js");
const utils_js_1 = require("./utils.js");
class HttpClient {
    options;
    constructor(options) {
        this.options = options;
    }
    async get(path, query = {}, init = {}) {
        const base = this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`;
        const url = new URL(path.replace(/^\//, ""), base);
        const search = (0, utils_js_1.params)(query);
        search.forEach((value, key) => url.searchParams.set(key, value));
        const cacheKey = `GET:${url.toString()}`;
        const cached = await this.options.cache?.get(cacheKey);
        if (cached !== undefined)
            return cached;
        let lastError;
        for (let attempt = 0; attempt <= this.options.retries; attempt++) {
            try {
                const response = await this.options.fetchImpl(url, {
                    ...init,
                    method: "GET",
                    headers: { Accept: "application/json", ...this.options.headers, ...(init.headers ?? {}) },
                });
                let body;
                const text = await response.text();
                if (text) {
                    try {
                        body = JSON.parse(text);
                    }
                    catch {
                        body = text;
                    }
                }
                if (!response.ok) {
                    if (response.status === 429) {
                        const retryHeader = response.headers.get("retry-after");
                        const retryAfterSeconds = retryHeader ? Number(retryHeader) : undefined;
                        throw new errors_js_1.RateLimitError(response.statusText, url.toString(), body, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined);
                    }
                    throw new errors_js_1.HttpError(response.status, response.statusText, url.toString(), body);
                }
                await this.options.cache?.set(cacheKey, body, this.options.cacheTtlMs);
                return body;
            }
            catch (error) {
                lastError = error;
                const isRetryable = error instanceof errors_js_1.RateLimitError ||
                    (error instanceof errors_js_1.HttpError && error.status >= 500) ||
                    error instanceof TypeError;
                if (!isRetryable || attempt >= this.options.retries)
                    throw error;
                const retryAfter = error instanceof errors_js_1.RateLimitError ? error.retryAfterSeconds : undefined;
                const delay = retryAfter !== undefined
                    ? retryAfter * 1000
                    : this.options.retryDelayMs * Math.pow(2, attempt);
                await (0, utils_js_1.sleep)(delay);
            }
        }
        throw lastError;
    }
}
exports.HttpClient = HttpClient;
//# sourceMappingURL=http.js.map