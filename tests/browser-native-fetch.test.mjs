import test from "node:test";
import assert from "node:assert/strict";
import { OpenLaunch, CopernicusClient, createCopernicusStac } from "../dist/index.js";

test("default native fetch keeps Window/global receiver across SDK entrypoints", async () => {
  const original = globalThis.fetch;
  const requests = [];
  try {
    // Emulate browser Window.fetch, which throws when SDK calls it detached.
    globalThis.fetch = function (url, init) {
      assert.equal(this, globalThis, "native fetch must be bound to globalThis / Window");
      requests.push({ url: String(url), method: init?.method });
      return Promise.resolve(new Response(
        JSON.stringify({ type: "FeatureCollection", features: [], links: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ));
    };

    const searchOptions = {
      collections: ["sentinel-2-l2a"],
      bbox: [12.1, 48.6, 18.9, 51.1],
      datetime: "2026-10-01T00:00:00Z/2026-10-13T00:00:00Z",
      limit: 5,
    };
    const main = new OpenLaunch({ retries: 0 });
    const direct = new CopernicusClient();
    const stac = createCopernicusStac();

    for (const client of [main.copernicus.stac, direct.stac, stac]) {
      const output = await client.search(searchOptions);
      assert.deepEqual(output.features, []);
    }

    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.url, "https://stac.dataspace.copernicus.eu/v1/search");
      assert.equal(request.method, "POST");
    }
  } finally {
    globalThis.fetch = original;
  }
});
