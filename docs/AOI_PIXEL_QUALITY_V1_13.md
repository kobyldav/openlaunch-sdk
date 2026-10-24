# OpenLaunch SDK v1.13 — AOI Pixel Quality

**Development PR.** This is an analysis of real QA/SCL mask values, not simulated satellite pixels or a claim of current production provider availability.

Use `SpaceMapClient.analyzeAoiPixelQuality({mask,area,source})` or `analyzeAoiPixelQuality` exported from `@openlaunch/raster`.

```ts
const report=maps.analyzeAoiPixelQuality({
 mask:yourDecodedRasterGrid,
 area:bbox(14,50.9,14.1,51),
 source:"sentinel-2-l2a-scl"
});
console.log(report.usablePercentOfAoi, report.cloudPercentOfClassified);
```

SCL: 4/5/6 clear, 8/9/10 cloud, 3 shadow, 11 snow, 0/1 nodata, 2/7 unknown. Landsat 8/9 C2 QA_PIXEL: bit0 fill, bits1–3 cloud/dilated/cirrus, bit4 shadow, bit5 snow, bit6 clear; no clear bit with no recognized hazard is unknown. Non-finite QA and optional science raster values are no-data.

Percentages use pixel centers and equal pixel weighting. `usablePercentOfAoi=clear/AOI pixels*100`; `cloudPercentOfClassified=cloud/(clear+cloud+shadow+snow)*100`. Missing denominators return **null**; unknown, snow and shadow are not silently called clear.

### Real COG input

```ts
const result=await maps.analyzeRemoteAoiPixelQuality({
 href:"https://your-trusted-provider.example/qa.tif",
 area:bbox(14,50.9,14.1,51),
 source:"sentinel-2-l2a-scl",
 allowedHosts:["your-trusted-provider.example"]
});
```

Remote retrieval uses OpenLaunch's existing HTTP 206-only byte-range reader, bounded input sizes and HTTPS domain allowlist. It supports single-band uncompressed/Deflate TIFF in EPSG:4326/3857 only. **Native UTM, JP2, LZW, multiband and complex imagery may be unsupported.** Backend must resolve the authentic QA asset URL, verify scene association, handle signing/credentials and enforce quotas. Never take allowedHosts or arbitrary href directly from the browser.

The derived flags `pixelEvidence:true`, `sourceSceneVerified:false`, `sensorAcquisitionVerified:false` distinguish actual decoded samples from unverified product association/acquisition. Raster QA does not confirm calibrated RGB scene quality.

### Fedora offline smoke

```bash
git fetch origin
git switch feature/aoi-pixel-quality-v1.13.0
git pull --ff-only origin feature/aoi-pixel-quality-v1.13.0
npm ci
npm run example:aoi-pixel-quality
```

Expected PASS, 8 AOI pixels, 2 cloudy pixels, 37.5% clear AOI. Automated regressions also decode genuine generated TIFF bytes from a mocked compliant HTTP range server.
