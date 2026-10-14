import {earthLayerCatalog,nasaGibsTileTemplate,issLiveSource} from "../dist/index.js";
console.log("OpenLaunch v1.2 | SDK-driven satellite layer switch configuration");
for(const category of ["observations","analyses","terrain-history","live"]){
 console.log("\n"+category);
 console.table(earthLayerCatalog().filter(x=>x.category===category).map(x=>({id:x.id,title:x.label,source:x.source,method:x.method,ready:x.implemented,freshness:x.freshness,observedAt:x.acquisitionTime??"unverified"})));
}
console.log("NASA GIBS WMTS (request does not assert availability):",nasaGibsTileTemplate("nasa-modis-terra","2026-10-13"));
console.log("ISS source (external, not a guaranteed real-time map):",issLiveSource());
console.log("Live FIRMS hotspots require a NASA MAP_KEY; no credentials or fabricated detections are bundled.");
