"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.date = exports.id = exports.bool = exports.num = exports.str = exports.get = exports.isRecord = void 0;
exports.imageFrom = imageFrom;
exports.videosFrom = videosFrom;
exports.params = params;
exports.clampLimit = clampLimit;
exports.countdown = countdown;
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
exports.isRecord = isRecord;
const get = (obj, path) => {
    let current = obj;
    for (const key of path.split(".")) {
        if (!(0, exports.isRecord)(current))
            return undefined;
        current = current[key];
    }
    return current;
};
exports.get = get;
const str = (value) => typeof value === "string" && value.length > 0 ? value : undefined;
exports.str = str;
const num = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
exports.num = num;
const bool = (value) => typeof value === "boolean" ? value : undefined;
exports.bool = bool;
const id = (value) => typeof value === "string" || typeof value === "number" ? value : undefined;
exports.id = id;
const date = (value) => {
    const text = (0, exports.str)(value);
    if (!text)
        return undefined;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
exports.date = date;
function imageFrom(value) {
    if (!(0, exports.isRecord)(value))
        return undefined;
    const url = (0, exports.str)(value.image_url) ?? (0, exports.str)(value.url);
    if (!url)
        return undefined;
    const result = { url };
    const name = (0, exports.str)(value.name);
    const thumbnailUrl = (0, exports.str)(value.thumbnail_url);
    const credit = (0, exports.str)(value.credit);
    const license = (0, exports.str)((0, exports.get)(value, "license.name"));
    if (name)
        result.name = name;
    if (thumbnailUrl)
        result.thumbnailUrl = thumbnailUrl;
    if (credit)
        result.credit = credit;
    if (license)
        result.license = license;
    return result;
}
function videosFrom(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item) => {
        if (!(0, exports.isRecord)(item))
            return [];
        const url = (0, exports.str)(item.url);
        if (!url)
            return [];
        const video = { url };
        const title = (0, exports.str)(item.title);
        const publisher = (0, exports.str)(item.publisher);
        const featured = (0, exports.bool)(item.featured);
        if (title)
            video.title = title;
        if (publisher)
            video.publisher = publisher;
        if (featured !== undefined)
            video.featured = featured;
        return [video];
    });
}
function params(query = {}) {
    const out = new URLSearchParams();
    const append = (key, value) => {
        if (value === null || value === undefined)
            return;
        if (Array.isArray(value)) {
            const compact = value.filter((v) => v !== null && v !== undefined).map(String);
            if (compact.length)
                out.set(key, compact.join(","));
            return;
        }
        out.set(key, String(value));
    };
    for (const [key, value] of Object.entries(query))
        append(key, value);
    return out;
}
function clampLimit(limit) {
    if (limit === undefined)
        return undefined;
    return Math.max(1, Math.min(100, Math.trunc(limit)));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
function countdown(target, now = new Date()) {
    const raw = target.getTime() - now.getTime();
    const isPast = raw < 0;
    let total = Math.abs(raw);
    const days = Math.floor(total / 86_400_000);
    total %= 86_400_000;
    const hours = Math.floor(total / 3_600_000);
    total %= 3_600_000;
    const minutes = Math.floor(total / 60_000);
    total %= 60_000;
    const seconds = Math.floor(total / 1000);
    return { totalMs: raw, days, hours, minutes, seconds, isPast };
}
//# sourceMappingURL=utils.js.map