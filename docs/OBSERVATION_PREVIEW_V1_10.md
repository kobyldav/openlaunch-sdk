# OpenLaunch SDK v1.10 — Verified Satellite Preview Delivery

**Status:** Development PR. Scoped npm packages remain unpublished unless explicitly released.

## Purpose

The OpenLaunch SDK stays the technology owner for data ingestion, provider-specific image acquisition and metadata validation. A website renders images returned by this SDK instead of implementing direct Copernicus/Planetary Computer downloads.

```ts
import { SpaceMapClient } from "@openlaunch/earth";
const sdk = new SpaceMapClient({
  previewAllowedHosts: ["<explicit verified image storage hostname>"],
  previewMaxBytes: 3*1024*1024,
  previewTimeoutMs: 12_000,
  previewSignPlanetary: false,
});
const result = await sdk.fetchObservationPreview({
  provider:"copernicus",
  collection:"sentinel-2-l2a",
  itemId:"<exact STAC item ID returned by exploreObservations>"
});
console.log(result.contentType,result.byteLength,result.previewVerified);
// Return result.image in an authenticated/throttled backend image response.
```

The caller supplies only `provider`, `collection` and `itemId`. The SDK chooses the official STAC endpoint and requests a single item. Only recognized collection/provider combinations are accepted. It selects provider-declared preview/visual JPEG/PNG assets without inventing an image from TIFF/COG data. HTTPS asset downloads require an **exact preapproved hostname** provided as SDK construction configuration (never derived automatically from a browser-supplied URL). Cloudflare Worker secrets and signed URLs should not reach the browser. The SDK rejects redirects, nonstandard HTTPS ports, invalid domains and malformed PNG/JPEG signatures; enforces a 3-MiB default and an 8-MiB hard maximum. Network and signing errors are sanitized to avoid leaking URLs with tokens.

Planetary Computer signing is optional via `previewSignPlanetary:true`, which calls the existing `PlanetaryComputerClient.signAsset()`; the final signed storage hostname must be explicitly allowlisted. Provider signing can rotate or fail; refresh on each request as needed and cache images in the backend according to provider licensing.

`previewVerified:true` confirms delivery of bytes with supported image MIME and header signatures. It **does not verify full image decoding**, image-geolocation, AOI pixel coverage, atmospheric conditions, or sensor acquisition time. `catalogAcquiredAt` originates from STAC metadata, and `verifiedAcquisition` remains false. The returned object deliberately excludes raw preview URLs and SAS query parameters.

## Fedora local smoke

```bash
git fetch origin
git switch feature/verified-observation-previews-v1.10.0
git pull --ff-only origin feature/verified-observation-previews-v1.10.0
npm ci
npm run example:observation-preview
```

Expected: `PASS OpenLaunch v1.10 Verified Observation Preview`, one STAC lookup, one image response, and a positive byte count. The fixture uses a simulated provider; this does not establish current live Copernicus/Microsoft availability.

## Risks and limitations

- Strict host allowlist may require deployment configuration updates when official storage endpoints migrate. No generic image proxy is exposed.
- A valid signature is not a decoder validation; malicious compressed-image payloads must be decoded in a sandboxed or resource-limited environment if preview transcoding is introduced.
- SDK currently returns raw bytes, not an externally accessible Cloudflare Worker route or an archival CDN.
- Browser routes must validate session, rate-limit requests and enforce quotas; untrusted host lists are **not** to be user-controlled.
- Existing catalog discovery and per-provider STAC requests may need token configuration or provider-specific authentication, and asset licensing/attribution still applies.
