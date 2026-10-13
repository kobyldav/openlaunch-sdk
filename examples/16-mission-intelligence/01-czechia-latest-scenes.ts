import { OpenLaunch, bbox } from "../../src/index.js";

// NETWORK: yes. Availability and missing metadata depend on provider catalogs.
const space = new OpenLaunch();
const to = new Date();
const from = new Date(to.getTime() - 30*86_400_000);
const report = await space.earth.discoverObservations({
  area:bbox(12.1,48.6,18.9,51.1),
  from,to,layers:["optical","radar","thermal","elevation"],perQueryLimit:12,
});
console.table(report.queryStatuses);
console.table(Object.entries(report.newestByLayer).map(([layer,record])=>({
  layer,
  id:record?.item.id,
  acquired:record?.product.acquiredAt?.toISOString() ?? "unknown",
  pixelResolutionsM:record?.product.availableResolutionsM.join(", ") ?? "",
  availableKinds:record?.product.availableKinds.join(", ") ?? "",
})));
console.log(report.warnings);
