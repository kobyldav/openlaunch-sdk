import test from "node:test";
import assert from "node:assert/strict";
import {
 selectSharedSentinelRegionSources,verifySharedSentinelRegionSourceYears,
 SENTINEL_REGION_SOURCE_LOCK_VERSION
} from "../dist/index.js";

/** Only catalog metadata fixtures: NEVER fabricated source reflectance pixels. */
const item=(year,day,cloud=12,variant="A")=>({
 id:"S2"+variant+"_"+year+"08"+String(day).padStart(2,"0")+"_L2A",
 acquiredAt:year+"-08-"+String(day).padStart(2,"0")+"T10:00:00Z",
 cloudPercent:cloud
});
const regional=(year)=>({year,scenes:[
 item(year,4,11),item(year,19,8),item(year,19,8),
 item(year,21,1),item(year,28,55),item(year,30,75)
]});
const years=[2023,2024,2025];

test("Stage 19: one stable genuine source pair per year for the entire region",()=>{
 const selected=selectSharedSentinelRegionSources(2023,2025,8,50,years.map(regional));
 assert.equal(selected.version,SENTINEL_REGION_SOURCE_LOCK_VERSION);
 assert.equal(selected.status,"real-sentinel-region-shared-scenes");
 assert.deepEqual(selected.seasons.map(y=>y.year),years);
 assert.ok(selected.seasons.every(y=>y.scenes.length===2));
 // Ranking prefers actual low cloud and distinguishes acquisitions >=4 days.
 assert.deepEqual(selected.seasons[0].scenes.map(s=>s.acquiredAt.slice(8,10)),["04","19"]);
 assert.ok(selected.seasons.every(y=>y.scenes[0].id!==y.scenes[1].id));
 assert.ok(selected.seasons.every(y=>
   Math.abs(Date.parse(y.scenes[0].acquiredAt)-Date.parse(y.scenes[1].acquiredAt))>=4*86400000));
 const actualYearReports=selected.seasons.map(y=>({year:y.year,
   scenes:y.scenes.map(scene=>({sceneId:scene.id,acquiredAt:scene.acquiredAt}))}));
 assert.equal(verifySharedSentinelRegionSourceYears(actualYearReports,selected),true);
 const otherTile=structuredClone(actualYearReports);
 otherTile[1].scenes[0].sceneId="S2B_UNRELATED_L2A";
 assert.equal(verifySharedSentinelRegionSourceYears(otherTile,selected),false);
 const changedDate=structuredClone(actualYearReports);
 changedDate[0].scenes[1].acquiredAt="2023-08-30T10:00:00Z";
 assert.equal(verifySharedSentinelRegionSourceYears(changedDate,selected),false);
});

test("Stage 19: missing common scene season or incorrect cloud cannot be patched per-tile",()=>{
 const list=years.map(regional);
 list[1]={year:2024,scenes:[item(2024,4,10),item(2024,6,5)]};
 assert.throws(()=>selectSharedSentinelRegionSources(2023,2025,8,50,list),
   /No two genuinely distinct common regional Sentinel/);
 const list2=years.map(regional);
 list2[1]={year:2024,scenes:[item(2024,4,88),item(2024,19,70)]};
 assert.throws(()=>selectSharedSentinelRegionSources(2023,2025,8,50,list2),
   /No two genuinely distinct common regional Sentinel/);
 assert.throws(()=>selectSharedSentinelRegionSources(2023,2025,8,-5,years.map(regional)),
   /3–5 consecutive/);
 const swapped=[regional(2023),regional(2025),regional(2024)];
 assert.throws(()=>selectSharedSentinelRegionSources(2023,2025,8,50,swapped),
   /ordered source catalogs/);
});

test("Stage 19: duplicate IDs, neighboring month and invalid acquisition dates cannot enter source lock",()=>{
 const entries=years.map(regional);
 entries[0].scenes=[
   item(2023,4,10),item(2023,4,10),item(2023,31,2),
   {id:"scene_valid_2023",acquiredAt:"2023-09-03T10:00:00Z",cloudPercent:1}
 ];
 const result=selectSharedSentinelRegionSources(2023,2025,8,50,entries);
 assert.deepEqual(result.seasons[0].scenes.map(s=>s.acquiredAt.slice(8,10)),["04","31"]);
 const corrupted=years.map(regional);
 corrupted[1]={year:2024,scenes:[
   {id:"bad-url;rm",acquiredAt:"2024-08-03T10:00:00Z",cloudPercent:10},
   {id:"bad-date",acquiredAt:"2024-08-99T10:00:00Z",cloudPercent:10}]};
 assert.throws(()=>selectSharedSentinelRegionSources(2023,2025,8,50,corrupted),
   /No two genuinely distinct/);
});
