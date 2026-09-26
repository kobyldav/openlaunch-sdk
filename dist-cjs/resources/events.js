"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsResource = void 0;
const mappers_js_1 = require("../mappers.js");
const base_js_1 = require("./base.js");
class EventsResource extends base_js_1.BaseResource {
    constructor(http) { super(http, "events"); }
    map = mappers_js_1.mapEvent;
    async upcoming(options = {}) {
        const raw = await this.http.get("events/upcoming/", { ordering: "date", ...this.query(options) });
        return { ...raw, results: raw.results.map(mappers_js_1.mapEvent) };
    }
    async previous(options = {}) {
        const raw = await this.http.get("events/previous/", { ordering: "-date", ...this.query(options) });
        return { ...raw, results: raw.results.map(mappers_js_1.mapEvent) };
    }
}
exports.EventsResource = EventsResource;
//# sourceMappingURL=events.js.map