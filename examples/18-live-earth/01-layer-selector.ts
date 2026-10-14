import { SpaceMapClient } from "../../src/index.js";
// Offline: web application builds layer navigation from SDK manifest only.
const maps=new SpaceMapClient();
for(const category of ["observations","analyses","terrain-history","live-video"] as const){
  console.log(category,maps.layers(category).map(x=>({id:x.id,name:x.label,origin:x.provider,kind:x.sourceType,temporal:x.temporalMode})));
}
console.log(maps.videoStream("iss-earth-live").watchUrl);
