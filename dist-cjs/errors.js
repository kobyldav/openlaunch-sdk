"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.CircuitOpenError = exports.TimeoutError = exports.ParseError = exports.RateLimitError = exports.HttpError = exports.OpenLaunchError = void 0;
class OpenLaunchError extends Error {
    constructor(message, options) { super(message, options); this.name = new.target.name; }
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
    }
}
exports.HttpError = HttpError;
class RateLimitError extends HttpError {
    retryAfterSeconds;
    constructor(statusText, url, body, retryAfterSeconds) {
        super(429, statusText, url, body);
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.RateLimitError = RateLimitError;
class ParseError extends OpenLaunchError {
    raw;
    constructor(message, raw) {
        super(message);
        this.raw = raw;
    }
}
exports.ParseError = ParseError;
class TimeoutError extends OpenLaunchError {
    timeoutMs;
    url;
    constructor(timeoutMs, url) {
        super(`Request timed out after ${timeoutMs} ms${url ? `: ${url}` : ""}`);
        this.timeoutMs = timeoutMs;
        this.url = url;
    }
}
exports.TimeoutError = TimeoutError;
class CircuitOpenError extends OpenLaunchError {
    retryAt;
    constructor(retryAt) {
        super(`Circuit breaker is open until ${retryAt.toISOString()}`);
        this.retryAt = retryAt;
    }
}
exports.CircuitOpenError = CircuitOpenError;
class ValidationError extends OpenLaunchError {
    field;
    constructor(message, field) {
        super(field ? `${field}: ${message}` : message);
        this.field = field;
    }
}
exports.ValidationError = ValidationError;
//# sourceMappingURL=errors.js.map