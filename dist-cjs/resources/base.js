"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseResource = void 0;
const utils_js_1 = require("../utils.js");
class BaseResource {
    http;
    endpoint;
    constructor(http, endpoint) {
        this.http = http;
        this.endpoint = endpoint;
    }
    query(options = {}) {
        return {
            limit: (0, utils_js_1.clampLimit)(options.limit), offset: options.offset, search: options.search,
            ordering: options.ordering, mode: options.mode, ...(options.filters ?? {}),
        };
    }
    async list(options = {}) {
        const raw = await this.http.get(`${this.endpoint}/`, this.query(options));
        return { ...raw, results: raw.results.map((item) => this.map(item)) };
    }
    async get(id, mode = "detailed") {
        const raw = await this.http.get(`${this.endpoint}/${encodeURIComponent(String(id))}/`, { mode });
        return this.map(raw);
    }
    async search(search, options = {}) {
        return this.list({ ...options, search });
    }
    async *iterate(options = {}) {
        const pageSize = (0, utils_js_1.clampLimit)(options.pageSize ?? options.limit ?? 100) ?? 100;
        const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
        let offset = options.offset ?? 0;
        let emitted = 0;
        while (emitted < maxItems) {
            const page = await this.list({ ...options, limit: pageSize, offset });
            if (page.results.length === 0)
                return;
            for (const item of page.results) {
                yield item;
                emitted++;
                if (emitted >= maxItems)
                    return;
            }
            if (!page.next || page.results.length < pageSize)
                return;
            offset += page.results.length;
        }
    }
    async all(options = {}) {
        const items = [];
        for await (const item of this.iterate(options))
            items.push(item);
        return items;
    }
    async first(options = {}) {
        const page = await this.list({ ...options, limit: 1, offset: 0 });
        return page.results[0] ?? null;
    }
    async count(options = {}) {
        const page = await this.list({ ...options, limit: 1, offset: 0 });
        return page.count;
    }
}
exports.BaseResource = BaseResource;
//# sourceMappingURL=base.js.map