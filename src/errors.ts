export class OpenLaunchError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = new.target.name; }
}

export class HttpError extends OpenLaunchError {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
    readonly body?: unknown,
  ) { super(`HTTP ${status} ${statusText} for ${url}`); }
}

export class RateLimitError extends HttpError {
  constructor(statusText: string, url: string, body?: unknown, readonly retryAfterSeconds?: number) {
    super(429, statusText, url, body);
  }
}

export class ParseError extends OpenLaunchError {
  constructor(message: string, readonly raw?: unknown) { super(message); }
}

export class TimeoutError extends OpenLaunchError {
  constructor(readonly timeoutMs: number, readonly url?: string) {
    super(`Request timed out after ${timeoutMs} ms${url ? `: ${url}` : ""}`);
  }
}

export class CircuitOpenError extends OpenLaunchError {
  constructor(readonly retryAt: Date) { super(`Circuit breaker is open until ${retryAt.toISOString()}`); }
}

export class ValidationError extends OpenLaunchError {
  constructor(message: string, readonly field?: string) { super(field ? `${field}: ${message}` : message); }
}
