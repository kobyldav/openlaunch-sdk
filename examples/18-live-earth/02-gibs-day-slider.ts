import { SpaceMapClient } from "../../src/index.js";
// Offline: XYZ URL patterns are generated from official NASA GIBS conventions.
// A requested day does not confirm a successful satellite acquisition.
const frames=new SpaceMapClient().nasaDailyTimeline(
  "MODIS_Terra_CorrectedReflectance_TrueColor",
  "2026-10-10","2026-10-14",
);
console.log(frames.map(f=>({day:f.requestedDate,url:f.urlTemplate,verified:f.verifiedAvailable})));
