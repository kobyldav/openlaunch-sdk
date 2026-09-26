"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaunchesResource = void 0;
const mappers_js_1 = require("../mappers.js");
const utils_js_1 = require("../utils.js");
const base_js_1 = require("./base.js");
class LaunchesResource extends base_js_1.BaseResource {
    constructor(http) { super(http, "launches"); }
    map = mappers_js_1.mapLaunch;
    launchQuery(options = {}) {
        return {
            ...this.query(options),
            is_crewed: options.isCrewed,
            include_suborbital: options.includeSuborbital,
            lsp__id: options.agencyId,
            launcher_config__id: options.rocketId,
            location__ids: options.locationIds,
            status__ids: options.statusIds,
            net__gte: options.from?.toISOString(),
            net__lte: options.to?.toISOString(),
        };
    }
    async list(options = {}) {
        const raw = await this.http.get("launches/", this.launchQuery(options));
        return { ...raw, results: raw.results.map(mappers_js_1.mapLaunch) };
    }
    async upcoming(options = {}) {
        const raw = await this.http.get("launches/upcoming/", {
            ordering: "net", hide_recent_previous: true, ...this.launchQuery(options),
        });
        return { ...raw, results: raw.results.map(mappers_js_1.mapLaunch) };
    }
    async previous(options = {}) {
        const raw = await this.http.get("launches/previous/", {
            ordering: "-net", ...this.launchQuery(options),
        });
        return { ...raw, results: raw.results.map(mappers_js_1.mapLaunch) };
    }
    async next(options = {}) {
        const page = await this.upcoming({ ...options, limit: 1, offset: 0 });
        return page.results[0] ?? null;
    }
    countdown(launch, now = new Date()) { return (0, utils_js_1.countdown)(launch.net, now); }
    isLive(launch, now = new Date(), graceMinutes = 20) {
        const start = launch.windowStart ?? launch.net;
        const end = launch.windowEnd ?? new Date(launch.net.getTime() + graceMinutes * 60_000);
        return now >= start && now <= end && Boolean(launch.webcast);
    }
    hasWebcast(launch) { return Boolean(launch.webcast ?? launch.videos[0]); }
}
exports.LaunchesResource = LaunchesResource;
//# sourceMappingURL=launches.js.map