# OpenLaunch SDK v1.20 — Web Map Integration Contract

Development feature (not an npm publication or production deployment). This new API deliberately does NOT include Next.js pages or Cloudflare Worker routes. The site renders and authenticates: provider integrations live in OpenLaunch.

## Frontend/Backend Contract

Recommended architecture:
```text
Next.js MapLibre map
   GET /api/earth/scenes?layer=...&from=...&to=...&bounds=...
        ↓ Cloudflare/Next backend (input validation, rate limits, auth, cache)
   SpaceMapClient.webMapSearch({layer,area:{bounds},from,to,maxResults})
        ↓ only JSON-safe metadata
   cards: scene ID, STAC timestamp, cloud cover, footprint, preview selector
        ↓ user clicks preview
   GET /api/earth/preview?provider=...&collection=...&itemId=...
        ↓ SpaceMapClient.fetchObservationPreview({provider,collection,itemId})
        ↓ exact reviewed host allowlist, bounded download and MIME+header checks
   HTTP image/jpeg or image/png bytes, Cache-Control according to attribution/license
```

`webMapSearch()` supports `sentinel2-optical`, `sentinel1-radar`, `landsat-temperature`, `dem-terrain` and `archive-scenes`. The explorer handles proper catalog collection mapping and date/AOI bounds. Returned previews are declared/unverified until explicitly downloaded. The SDK gives NO arbitrary provider URLs or signed hrefs to the web. Three catalog statuses are retained and translated into ready/empty/partial/unavailable; provider failures must never look like "no satellites".

`webMapDaily()` supports `nasa-modis-terra` and `nasa-viirs-noaa20` and returns the official NASA GIBS WMTS-derived XYZ template for `MapLibre/Leaflet`. Requested UTC calendar dates are not verified acquisition timestamps; the web should show attribution and handle missing tiles gracefully.

## Server Integration

```ts
import {SpaceMapClient} from "@openlaunch/earth";
const maps=new SpaceMapClient({
 previewAllowedHosts:["<reviewed storage hostname only>"],
 previewSignPlanetary:true, // optional if your chosen storage provider needs signing
});
const result=await maps.webMapSearch({
 layer:"sentinel2-optical",
 area:{bounds:[14.2,49.9,14.6,50.3]},
 from:"2026-10-01",to:"2026-10-20",maxResults:20
});
// Convert result to JSON and serve to your frontend.
const selected=result.scenes.find(s=>s.preview.request);
if(selected?.preview.request){
 const preview=await maps.fetchObservationPreview(selected.preview.request);
 // Return preview.image bytes from your backend with preview.contentType.
}
const nasa=maps.webMapDaily({layer:"nasa-modis-terra",date:"2026-10-17"});
// MapLibre raster source: tiles: [nasa.urlTemplate], maxzoom: nasa.maxZoom.
// Never display 'LIVE' just because the requested day is current.
```

**Limits:** All new tests are mocked network fixtures. Live upstream Copernicus/NASA availability, the Cloudflare Worker runtime, tile CORS and provider licensing have not been verified. Some layers are only metadata searches, not browseable pixel tiles. Cloudflare account secrets, host allowlists, response caching, error reporting and public abuse quotas must be configured/deployed in the web backend. For real weather streams, use existing `meteosatTimeline()/meteosatImage()` with separate upstream validation.

## Fedora

```bash
git fetch origin
git switch feature/web-map-workflow-v1.20.0
git pull --ff-only origin feature/web-map-workflow-v1.20.0
npm ci
npm run example:web-map
```

The smoke verifies one STAC catalog search, one official scene lookup, one real PNG byte delivery from a mock HTTPS origin, one NASA day tile descriptor, and no signed URLs in metadata. `npm test` checks all other SDK regressions.
