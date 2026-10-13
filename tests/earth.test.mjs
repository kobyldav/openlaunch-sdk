import test from "node:test";
import assert from "node:assert/strict";
import {
  bbox,
  circle,
  centerOf,
  ndvi,
  ndwi,
  nbr,
  rankScenes,
  latestClearScene,
  StacClient,
  OpenMeteoClient,
  EarthIntelligenceClient,
} from "../dist/index.js";

test("AOI helpers create stable GeoJSON and bbox", () => {
  const area = bbox(4.0, 51.8, 4.3, 52.0);
  assert.equal(area.geometry.type, "Polygon");
  assert.deepEqual(centerOf(area), [4.15, 51.9]);

  const around = circle([4.1453, 51.9475], 5, 16);
  assert.equal(around.geometry.type, "Polygon");
  assert.equal(around.geometry.coordinates[0].length, 17);
  assert.ok(around.bbox[0] < 4.1453 && around.bbox[2] > 4.1453);
});

test("spectral indices return expected values", () => {
  assert.ok(Math.abs(ndvi(0.8, 0.2) - 0.6) < 1e-12);
  assert.ok(ndwi(0.5, 0.1) > 0);
  assert.ok(nbr(0.7, 0.2) > 0);
});

test("scene ranking favors clear recent scenes", () => {
  const items = [
    {
      type: "Feature",
      id: "cloudy",
      geometry: null,
      properties: { datetime: "2026-10-10T10:00:00Z", "eo:cloud_cover": 70 },
      assets: {},
    },
    {
      type: "Feature",
      id: "clear",
      geometry: null,
      properties: { datetime: "2026-10-09T10:00:00Z", "eo:cloud_cover": 5 },
      assets: {},
    },
  ];
  const ranked = rankScenes(items, { maxCloudCoverPercent: 80, now: new Date("2026-10-11T00:00:00Z") });
  assert.equal(ranked[0].item.id, "clear");
  assert.equal(latestClearScene(items, 20)?.id, "clear");
});

test("STAC client emits a standards-shaped POST search", async () => {
  let requestBody;
  const fetch = async (_input, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ type: "FeatureCollection", features: [], links: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const stac = new StacClient({ baseUrl: "https://example.test/stac/", fetch, cache: false });
  const result = await stac.search({
    collections: ["sentinel-2-l2a"],
    bbox: [4, 51, 5, 52],
    datetime: "2026-10-01T00:00:00Z/2026-10-11T00:00:00Z",
    limit: 5,
  });
  assert.equal(result.features.length, 0);
  assert.deepEqual(requestBody.collections, ["sentinel-2-l2a"]);
  assert.deepEqual(requestBody.bbox, [4, 51, 5, 52]);
  assert.equal(requestBody.limit, 5);
});

test("Open-Meteo client maps forecast into observation conditions", async () => {
  const fetch = async () => new Response(JSON.stringify({
    latitude: 51.95,
    longitude: 4.14,
    timezone: "UTC",
    hourly: {
      time: ["2026-10-11T10:00", "2026-10-11T11:00"],
      cloud_cover: [80, 10],
      visibility: [8000, 30000],
      precipitation_probability: [40, 0],
      is_day: [1, 1],
      temperature_2m: [13, 14],
      relative_humidity_2m: [80, 60],
    },
  }), { status: 200, headers: { "content-type": "application/json" } });

  const weather = new OpenMeteoClient({ fetch, cache: false });
  const conditions = await weather.conditionsAt(51.95, 4.14, new Date("2026-10-11T10:55:00Z"));
  assert.equal(conditions.cloudCoverPercent, 10);
  assert.equal(conditions.visibilityM, 30000);
  assert.equal(conditions.isDay, true);
});

test("Earth intelligence chooses radar when optical conditions are poor", () => {
  const earth = new EarthIntelligenceClient();
  const recommendation = earth.recommendSensor({
    time: new Date(),
    cloudCoverPercent: 85,
    isDay: true,
  }, 30);
  assert.equal(recommendation.sensor, "radar");
  assert.ok(recommendation.reasons.length > 0);
});
