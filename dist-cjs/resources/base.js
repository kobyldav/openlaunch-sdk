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
}
exports.BaseResource = BaseResource;
//# sourceMappingURL=base.js.map