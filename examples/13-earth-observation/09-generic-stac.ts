/**
 * Connect any standards-compatible STAC API without waiting for an OpenLaunch release.
 * Uses: StacClient
 * Network: yes
 */
import { StacClient } from "../../src/index.js";

const catalog = new StacClient({
  baseUrl: "https://planetarycomputer.microsoft.com/api/stac/v1/",
});

const collections = await catalog.collections();
console.log("Collections:", collections.collections.slice(0, 10).map((collection) => collection.id));
