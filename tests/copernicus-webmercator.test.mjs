import test from "node:test";
import assert from "node:assert/strict";
import { bbox, buildProcessRequest, RADAR_VV_EVALSCRIPT, OpenLaunch } from "../dist/index.js";

const area = bbox(14.4, 50.0, 14.45, 50.05);
test("Copernicus Process API creates georeferenced Web Mercator bounds", () => {
  const request = buildProcessRequest({
    area, webMercatorBounds: [1600000, 6400000, 1609000, 6409000],
    dataType: "sentinel-2-l2a",
    from: "2026-10-01T00:00:00Z", to: "2026-10-14T00:00:00Z",
    evalscript: "//VERSION=3\nfunction setup(){}",
    width: 256, height: 256, format: "image/png",
  });
  assert.deepEqual(request.input.bounds.bbox, [1600000, 6400000, 1609000, 6409000]);
  assert.equal(request.input.bounds.properties.crs, "http://www.opengis.net/def/crs/EPSG/0/3857");
  assert.equal(Object.hasOwn(request.input.bounds, "geometry"), false);
  assert.equal(request.output.width, 256);
  assert.equal(request.output.height, 256);
});

test("Legacy geographic AOI output is unchanged", () => {
  const request = buildProcessRequest({
    area, dataType: "sentinel-2-l2a", from: new Date("2026-10-01"), to: new Date("2026-10-14"),
    evalscript: "//VERSION=3", width: 512,
  });
  assert.equal(request.input.bounds.properties.crs, "http://www.opengis.net/def/crs/OGC/1.3/CRS84");
  assert.deepEqual(request.input.bounds.geometry, area.geometry);
});

test("Invalid projected rectangles are rejected", () => {
  for (const window of [[0, 2, 1, 1], [1, 2, 1, 4], [Infinity, 0, 12, 10], [-50000000, 0, 1, 1]]) {
    assert.throws(() => buildProcessRequest({
      area, webMercatorBounds: window,
      dataType: "sentinel-2-l2a", from: "2026-10-01", to: "2026-10-14", evalscript: "",
    }), RangeError);
  }
});

test("OpenLaunch radarVV sends an actual SDK Process request", async () => {
  let captured;
  const client = new OpenLaunch({
    copernicusAccessToken: "mock-token",
    retries: 0,
    fetch: async (url, init) => {
      captured = { url: String(url), init, body: JSON.parse(init.body) };
      return new Response(new Uint8Array([137,80,78,71]), {status:200,headers:{"content-type":"image/png"}});
    },
  });
  const output = await client.copernicus.radarVV(area,"2026-10-01T00:00:00Z","2026-10-14T00:00:00Z", {
    webMercatorBounds: [1600000, 6400000, 1609000, 6409000], width: 256, height: 256,
  });
  assert.equal(captured.url, "https://sh.dataspace.copernicus.eu/process/v1");
  assert.equal(captured.init.headers.Authorization, "Bearer mock-token");
  assert.equal(captured.body.input.data[0].type, "sentinel-1-grd");
  assert.equal(captured.body.input.bounds.properties.crs,"http://www.opengis.net/def/crs/EPSG/0/3857");
  assert.equal(captured.body.evalscript, RADAR_VV_EVALSCRIPT);
  assert.equal(output.data.byteLength,4);
});
