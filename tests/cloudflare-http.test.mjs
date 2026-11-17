import test from "node:test";
import assert from "node:assert/strict";
import { boundedProviderGet } from "../dist/providers/eo-bounded.js";

const official = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.jpg";

test("portable safe fetch uses manual redirects on Cloudflare Workers and Node", async () => {
  let redirects = [];
  const payload = new Uint8Array([255, 216, 255, 5, 4, 3]);
  const result = await boundedProviderGet(official, {
    fetch: async (_url, init) => {
      redirects.push(init.redirect);
      // Simulates Cloudflare rejecting any unsupported redirect mode.
      if (init.redirect === "error") throw new TypeError("Unsupported redirect mode: error");
      return new Response(payload, { status: 200, headers: { "content-type": "image/jpeg" } });
    },
  });
  assert.deepEqual(redirects, ["manual"]);
  assert.deepEqual(result.bytes, payload);
  assert.equal(result.contentType, "image/jpeg");
});
test("HTTP 302 never follows redirects or forwards sensitive request headers", async () => {
  const secret = "NOT_SHARED_WITH_UNTRUSTED_HOST";
  let count = 0;
  await assert.rejects(
    boundedProviderGet("https://firms.modaps.eosdis.nasa.gov/api/area/csv/" + secret, {
      fetch: async (_url, init) => {
        count++;
        assert.equal(init.redirect, "manual");
        return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
      },
    }),
    /Provider HTTP 302/
  );
  assert.equal(count, 1);
});
