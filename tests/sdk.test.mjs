import test from "node:test";
import assert from "node:assert/strict";
import { MemoryCache, OpenLaunch } from "../dist/index.js";

const payload = {
  count: 1, next: null, previous: null,
  results: [{
    id: "launch-1", url: "https://example.test/launch-1/", name: "Falcon 9 | Test",
    status: { id: 1, name: "Go for Launch", abbrev: "Go" },
    net: "2030-01-02T03:04:05Z", window_start: "2030-01-02T03:00:00Z", window_end: "2030-01-02T03:10:00Z",
    rocket: { configuration: { id: 9, name: "Falcon 9", full_name: "Falcon 9 Block 5", manufacturer: { id: 121, name: "SpaceX", abbrev: "SpX" } } },
    launch_service_provider: { id: 121, name: "SpaceX", abbrev: "SpX" },
    pad: { id: 80, name: "LC-39A", latitude: 28.6, longitude: -80.6, location: { name: "Kennedy Space Center" } },
    mission: { id: 2, name: "Test mission", orbit: { name: "Low Earth Orbit", abbrev: "LEO" } },
    vid_urls: [{ url: "https://youtube.test/live", featured: true }]
  }]
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" }
});

test("normalizes next launch", async () => {
  const fetchMock = async () => jsonResponse(payload);
  const sdk = new OpenLaunch({ baseUrl: "https://example.test/2.3.0/", fetch: fetchMock, retries: 0 });
  const launch = await sdk.launches.next();
  assert.equal(launch?.name, "Falcon 9 | Test");
  assert.equal(launch?.rocket?.fullName, "Falcon 9 Block 5");
  assert.equal(launch?.provider?.name, "SpaceX");
  assert.equal(launch?.mission?.orbit?.abbreviation, "LEO");
  assert.equal(launch?.webcast?.url, "https://youtube.test/live");
  assert.ok(launch?.net instanceof Date);
});

test("caches identical GET requests", async () => {
  let calls = 0;
  const fetchMock = async () => { calls += 1; return jsonResponse(payload); };
  const sdk = new OpenLaunch({ baseUrl: "https://example.test/2.3.0/", fetch: fetchMock, cache: new MemoryCache(), retries: 0 });
  await sdk.launches.next();
  await sdk.launches.next();
  assert.equal(calls, 1);
});

test("uses token authentication", async () => {
  const fetchMock = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Token secret");
    return jsonResponse(payload);
  };
  const sdk = new OpenLaunch({ baseUrl: "https://example.test/2.3.0/", fetch: fetchMock, apiKey: "secret", retries: 0 });
  await sdk.launches.next();
});
