import test from "node:test";
import assert from "node:assert/strict";
import { CelesTrakClient, NasaClient, ommToOrbitalElements } from "../dist/index.js";

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("CelesTrak provider uses OMM JSON query", async () => {
  let urlSeen = "";
  const fetchMock = async (url) => { urlSeen = String(url); return json([{ OBJECT_NAME: "ISS", NORAD_CAT_ID: 25544 }]); };
  const c = new CelesTrakClient({ fetch: fetchMock, cache: false });
  const rows = await c.byCatalogNumber(25544);
  assert.equal(rows[0].OBJECT_NAME, "ISS");
  assert.match(urlSeen, /CATNR=25544/);
  assert.match(urlSeen, /FORMAT=JSON/);
});

test("NASA provider injects api_key", async () => {
  let urlSeen = "";
  const fetchMock = async (url) => { urlSeen = String(url); return json({ ok: true }); };
  const n = new NasaClient({ apiKey: "abc", fetch: fetchMock, cache: false });
  await n.neoBrowse();
  assert.match(urlSeen, /api_key=abc/);
});

test("OMM conversion yields finite orbital elements", () => {
  const el = ommToOrbitalElements({ MEAN_MOTION: 15.5, ECCENTRICITY: 0.001, INCLINATION: 51.6, RA_OF_ASC_NODE: 30, ARG_OF_PERICENTER: 40, MEAN_ANOMALY: 10 });
  assert.ok(Number.isFinite(el.semiMajorAxisM));
  assert.ok(el.semiMajorAxisM > 6_000_000 && el.semiMajorAxisM < 8_000_000);
});
