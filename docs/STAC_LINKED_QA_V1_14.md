# OpenLaunch SDK v1.14 — STAC-linked QA Pixel Analysis

Status: feature branch, draft PR; not an npm publication or confirmation of production availability.

## Single API

```ts
import {SpaceMapClient} from "@openlaunchsdk/earth";
const maps=new SpaceMapClient({
 qaAllowedHosts:["<reviewed provider TIFF storage hostname>"],
 qaSignPlanetary:true,
 qaMaxPixels:1_048_576,
});
const report=await maps.analyzeObservationQa({
 provider:"copernicus",collection:"sentinel-2-l2a",
 itemId:"<exact STAC observation ID>",area:yourAoi
});
console.log(report.quality,report.qaAssetKey,report.catalogAcquiredAt);
```

The SDK queries its fixed official STAC endpoint and validates returned item ID and collection. Only exact band keys `SCL` / `SCL_20m` for Sentinel-2 or `QA_PIXEL` for Landsat Collection 2 L2 are accepted. Ambiguous or missing masks fail explicitly; thumbnails and other spectral bands never masquerade as cloud masks. Signer for Planetary Computer is optional; only preapproved HTTPS storage domains and supported .tif/.tiff file extensions can reach the remote window reader. Neither signing secrets nor asset URLs are returned.

`linkedFromStacItem:true` means QA comes from the same STAC item object. `independentlyVerifiedSceneAssociation:false` means independent cryptographic provenance has NOT been established. Sensor acquisition is not independently verified.

## Limitations

Existing OpenLaunch remote COG reader supports single-band Deflate/uncompressed TIFF with EPSG:4326/3857. **Common real Sentinel-2 SCL is JPEG2000/JP2 or UTM-projected, which this does not yet decode.** Those products are not treated as valid scenes with no clouds. Landsat QA may also be in UTM and fail until reprojection and format handling are added. The API cannot promise every STAC item has a usable QA asset. The SDK does not yet provide multi-scene AOI cloud ranking using real masks.

Security: allowedHosts is backend configuration, not an incoming user argument; rate-limit and cache STAC + TIFF requests. The SDK refuses redirects, unsafe hostnames, arbitrary URL selection and unsupported sensors. Any fetch error is sanitized to avoid leaking URL query parameters or SAS tokens.

## Fedora

```bash
git fetch origin
git switch feature/stac-qa-linkage-v1.14.0
git pull --ff-only origin feature/stac-qa-linkage-v1.14.0
npm ci
npm run example:linked-qa
```

Expected: `PASS OpenLaunch v1.14 STAC Linked QA Analysis`, two remote TIFF range requests and 2 clear / 2 cloudy pixels. All tests use a locally generated TIFF and simulated STAC metadata, not live imagery.
