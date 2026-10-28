import {SpaceMapClient} from "../../src/index.js";
// A descriptor says where imagery might be found; it is not proof of an acquisition.
const sdk=new SpaceMapClient();
const categories=["observations","analyses","terrain-history","live-video"] as const;
const rows=categories.flatMap(category=>sdk.layers(category));
const ids=new Set(rows.map(x=>x.id));
if(rows.length!==18||ids.size!==18)throw Error("18 registered layers expected");
if(rows.some(x=>x.liveVerified||x.observationTime!==null||x.lastCheckedAt!==null))
 throw Error("Unverified layers were reported as live observations");
const gibs=sdk.webMapDaily({layer:"nasa-modis-terra",date:"2026-10-17"});
if(gibs.verifiedAcquisition||gibs.delivery!=="unchecked")
 throw Error("GIBS tile template was falsely marked as a verified acquisition");
console.log("PASS layer descriptor provenance",rows.length);
