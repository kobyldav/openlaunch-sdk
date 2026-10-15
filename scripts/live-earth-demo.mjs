import {
  SpaceMapClient, GIBS_PRESETS,
  meteosatWmsMapUrl, parseFirmsCsv, bbox,
} from "../dist/index.js";

// Entirely offline integration overview: real SDK APIs; no fabricated live
// observations, no secretly fetched satellite imagery and no fake video frames.
const maps=new SpaceMapClient();
console.log("=== OpenLaunch v1.2: Earth live layers / provider capability catalog ===");
for(const category of ["observations","analyses","terrain-history","live-video"]){
  const layers=maps.layers(category);
  console.log(category,":",layers.map(l=>l.id).join(", "));
}
const tiles=maps.nasaDailyTiles(GIBS_PRESETS[0].id,"2026-10-13");
console.log("NASA GIBS validated tile URL *template* (not downloaded):",tiles.urlTemplate);
const weather=maps.meteosatMap({
  layer:"example:only-when-in-provider-capabilities",
  bounds3857:[1300000,6200000,1700000,6800000],
  width:512,height:512,
});
console.log("EUMETView WMS request template:",weather.url);
console.log("Weather observation timestamp known:",weather.observedAt!==null);
const csv="latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,daynight,frp\n"+
  "50.0755,14.4378,2026-10-13,0910,NPP,VIIRS,n,D,6.1\n";
console.log("Actual parsed (synthetic example) FIRMS data:",parseFirmsCsv(csv,{bounds:bbox(12,48,19,52).bbox}).items);
console.log("Official Meteosat Europe stream descriptor:",maps.videoStream("meteosat-europe-live"));
console.log("Official NASA ISS stream descriptor:",maps.videoStream("iss-earth-live"));
console.log("No live availability is asserted without a real provider request.");
