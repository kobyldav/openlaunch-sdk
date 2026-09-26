export class OpenLaunchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OpenLaunchError";
  }
}

export class HttpError extends OpenLaunchError {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly body?: unknown,
  ) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = "HttpError";
  }
}

export class RateLimitError extends HttpError {
  constructor(statusText: string, url: string, body?: unknown, public readonly retryAfterSeconds?: number) {
    super(429, statusText, url, body);
    this.name = "RateLimitError";
  }
}

export class ParseError extends OpenLaunchError {
  constructor(message: string, public readonly payload?: unknown) {
    super(message);
    this.name = "ParseError";
  }
}
