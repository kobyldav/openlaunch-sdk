# OpenLaunch SDK

A small, typed and runtime-agnostic TypeScript SDK for rocket launches and spaceflight data. It currently uses **The Space Devs Launch Library 2 (LL2) v2.3.0** and normalizes the most useful entities into stable TypeScript models.

> Status: `0.1.0` — usable MVP. The public API is intentionally small so it can evolve without locking applications to LL2's raw response shapes.

## Why

LL2 is powerful, but applications should not have to couple themselves to every upstream field name. OpenLaunch provides one client, typed models, caching, retries, token auth and helpers such as countdowns.

## Install

```bash
npm install openlaunch-sdk
```

For local development of this repository:

```bash
npm install
npm run check
```

## Quick start

```ts
import { OpenLaunch } from "openlaunch-sdk";

const space = new OpenLaunch();
const launch = await space.launches.next();

if (launch) {
  console.log(launch.name);
  console.log(launch.rocket?.fullName);
  console.log(launch.net);
  console.log(launch.webcast?.url);
}
```

`SpaceClient` is exported as an alias of `OpenLaunch`:

```ts
import { SpaceClient } from "openlaunch-sdk";
const space = new SpaceClient();
```

## API

### Launches

```ts
space.launches.next()
space.launches.upcoming({ limit: 10 })
space.launches.previous({ limit: 10 })
space.launches.list({ search: "Starlink" })
space.launches.search("Starship", { limit: 5 })
space.launches.get("launch-id")

space.launches.countdown(launch)
space.launches.hasWebcast(launch)
space.launches.isLive(launch)
```

Launch filters include `isCrewed`, `includeSuborbital`, `agencyId`, `rocketId`, `locationIds`, `statusIds`, `from` and `to`.

### Other typed resources

```ts
space.rockets.list()
space.rockets.search("Falcon 9")
space.rockets.get(9)

space.agencies.search("SpaceX")
space.astronauts.search("Pesquet")
space.events.upcoming()
space.events.previous()
space.pads.search("39A")
```

### Additional generic resources

These already support `.list()`, `.search()` and `.get()` while keeping their model deliberately minimal:

```ts
space.spacecraft
space.spaceStations
space.celestialBodies
space.dockingEvents
space.expeditions
space.payloads
space.programs
```

### Raw escape hatch

Anything LL2 supports can be requested without waiting for an SDK wrapper:

```ts
const data = await space.raw("updates/", { limit: 5 });
```

## Development endpoint

LL2 provides an unlimited development endpoint with stale/limited data. Use it while building:

```ts
import { OpenLaunch, DEVELOPMENT_BASE_URL } from "openlaunch-sdk";

const space = new OpenLaunch({ baseUrl: DEVELOPMENT_BASE_URL });
```

## Cache

A five-minute in-memory cache is enabled by default because anonymous production access is rate-limited.

```ts
const space = new OpenLaunch({ cacheTtlMs: 60_000 });
```

Disable it:

```ts
const space = new OpenLaunch({ cache: false });
```

Or bring your own adapter (Redis, Cloudflare KV, AsyncStorage, etc.):

```ts
const space = new OpenLaunch({ cache: myCacheAdapter });
```

Implement:

```ts
interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined> | T | undefined;
  set<T>(key: string, value: T, ttlMs: number): Promise<void> | void;
}
```

## LL2 API token

If you have a The Space Devs API token:

```ts
const space = new OpenLaunch({ apiKey: process.env.LL2_API_KEY });
```

It is sent as `Authorization: Token <apiKey>`. Do not embed private tokens in browser/mobile bundles.

## Runtime compatibility

The package has no runtime dependencies and uses standard `fetch`, `URL`, `Headers` and `Date` APIs. Targets include Node.js 18+, Bun, modern browsers, React Native/Expo environments with Fetch, Deno and Cloudflare Workers.

## Error handling

```ts
import { HttpError, RateLimitError } from "openlaunch-sdk";

try {
  await space.launches.next();
} catch (error) {
  if (error instanceof RateLimitError) console.error("Rate limited", error.retryAfterSeconds);
  else if (error instanceof HttpError) console.error(error.status, error.body);
}
```

The client retries HTTP 5xx, network `TypeError`s and 429 responses with exponential backoff. Retry behavior is configurable.

## Rate-limit status

```ts
console.log(await space.throttle());
```

## Package scripts

- `npm run build` — dependency-free ESM + CommonJS + `.d.ts` build
- `npm test` — Node built-in unit tests
- `npm run typecheck` — strict TS check
- `npm run check` — typecheck + tests + build

## Data source and attribution

Data is provided by The Space Devs / Launch Library 2. Review their current API documentation, usage guidance and attribution recommendations before shipping a production product.

## License

MIT. This license applies to this SDK's source code, not to third-party API data, imagery or media returned by upstream providers.
