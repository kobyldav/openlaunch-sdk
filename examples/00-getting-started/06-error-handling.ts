/**
 * Handle typed SDK errors
 *
 * Pattern for distinguishing rate limits, timeouts and other HTTP failures.
 *
 * Uses: OpenLaunch, RateLimitError, TimeoutError, HttpError
 * Network: no
 */
import { HttpError, OpenLaunch, RateLimitError, TimeoutError } from "../../src/index.js";

const space = new OpenLaunch({ timeoutMs: 10_000 });

async function loadNextLaunch(): Promise<void> {
  try {
    console.log((await space.launches.next())?.name);
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error("Rate limited; retry-after seconds:", error.retryAfterSeconds);
    } else if (error instanceof TimeoutError) {
      console.error("Timed out after", error.timeoutMs, "ms");
    } else if (error instanceof HttpError) {
      console.error("HTTP error", error.status, error.url);
    } else {
      throw error;
    }
  }
}

void loadNextLaunch;
