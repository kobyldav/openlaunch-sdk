"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParseError = exports.RateLimitError = exports.HttpError = exports.OpenLaunchError = void 0;
class OpenLaunchError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = "OpenLaunchError";
    }
}
exports.OpenLaunchError = OpenLaunchError;
class HttpError extends OpenLaunchError {
    status;
    statusText;
    url;
    body;
    constructor(status, statusText, url, body) {
        super(`HTTP ${status} ${statusText} for ${url}`);
        this.status = status;
        this.statusText = statusText;
        this.url = url;
        this.body = body;
        this.name = "HttpError";
    }
}
exports.HttpError = HttpError;
class RateLimitError extends HttpError {
    retryAfterSeconds;
    constructor(statusText, url, body, retryAfterSeconds) {
        super(429, statusText, url, body);
        this.retryAfterSeconds = retryAfterSeconds;
        this.name = "RateLimitError";
    }
}
exports.RateLimitError = RateLimitError;
class ParseError extends OpenLaunchError {
    payload;
    constructor(message, payload) {
        super(message);
        this.payload = payload;
        this.name = "ParseError";
    }
}
exports.ParseError = ParseError;
//# sourceMappingURL=errors.js.map