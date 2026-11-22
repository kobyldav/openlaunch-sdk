import test from "node:test";
import assert from "node:assert/strict";
import {SentinelMultiYearRegionAccumulator,
 SENTINEL_MULTIYEAR_REGION_VERSION,OpenLaunch} from "../dist/index.js";

const area=(west,south=50.09)=>({west,south,east:west+.01,north:south+.01});
function genuineTile({from=2023,to=2025,valid=60,total=100,
  robust=40,slope=.04,shift=0,resolution=10}={}){
 return {status:"real-sentinel-multiyear-seasonal-trend",version:1,month:8,
   width:10,height:total/10,groundSamplingM:resolution,
   qa:{allSourceSclMasked:true,allSameGrid:true,
     fixedCommonPixelPopulation:true,noGapFilling:true,
     leaveOneYearOutSensitivity:true},
   years:Array.from({length:to-from+1},(_,i)=>({
     year:from+i,meanNdviOnCommon:.2+shift+.05*i,
     scenes:[5,19].map((d,j)=>({
       sceneId:"S2A_"+(from+i)+"08"+String(d).padStart(2,"0")+"_"+j+"_L2A",
       acquiredAt:(from+i)+"-08-"+String(d).padStart(2,"0")+"T10:00:00Z"
     }))
   })),
   statistics:{firstYear:from,lastYear:to,yearCount:to-from+1,
     totalPixels:total,commonValidPixels:valid,
     robustAllYearsPixels:robust,meanSlopeNdviPerYear:slope}
 };
}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,"Expected "+a+" ≈ "+b);

test("Stage 16: source-proven tiles aggregate only common observed pixels",()=>{
 const regional=new SentinelMultiYearRegionAccumulator(
   2023,2025,8,["0-1-1","0-2-1"]);
 const a=genuineTile({valid:50,robust:40,slope:.1,shift:0}),
   b=genuineTile({valid:20,robust:10,slope:-.1,shift:.3});
 regional.addResult("0-1-1",area(14.40),a);
 const incomplete=regional.snapshot();
 assert.equal(incomplete.pendingTiles,1);
 assert.equal(incomplete.regionFullyAnalyzed,false);
 assert.throws(()=>regional.finish(),/incomplete/);
 regional.addResult("0-2-1",area(14.41),b);
 const result=regional.finish();
 assert.equal(result.version,SENTINEL_MULTIYEAR_REGION_VERSION);
 assert.equal(result.status,"real-sentinel-multiyear-region-coverage");
 assert.equal(result.requestedTiles,2);
 assert.equal(result.analyzedTiles,2);
 assert.equal(result.commonValidPixels,70);
 assert.equal(result.robustAllYearsPixels,50);
 assert.equal(result.analyzedPixels,200);
 approx(result.percentValidWithinAnalyzedTiles,35);
 approx(result.meanSlopeOnObservedPixels,(50*.1-20*.1)/70);
 approx(result.years[0].meanNdviOnObservedPixels,(50*.2+20*.5)/70);
 approx(result.years[2].meanNdviOnObservedPixels,(50*.3+20*.6)/70);
 assert.equal(result.regionFullyAnalyzed,true);
 assert.equal(result.tiles[0].sourceScenes.length,3);
 assert.equal(result.tiles[0].sourceScenes[0].scenes.length,2);
 assert.equal("slopePerYear" in result.tiles[0],false);
 assert.equal("ndviValues" in result.tiles[0],false);
 assert.equal(typeof new OpenLaunch().terrain.analyzeSentinelMultiYear,"function");
 assert.equal(typeof new OpenLaunch().terrain.createSentinelMultiYearRegion,"function");
});

test("Stage 16: missing & errored source tiles are explicit, never counted as zero values",()=>{
 const a=new SentinelMultiYearRegionAccumulator(
   2023,2025,8,["a","b","c"]);
 a.addResult("a",area(14.40),genuineTile({valid:30,robust:10,slope:.02}));
 a.addUnavailable("b",area(14.41),"insufficient",
   "No two independent real source scenes for 2024");
 a.addUnavailable("c",area(14.42),"error","Source COG unavailable");
 const report=a.finish();
 assert.equal(report.analyzedTiles,1);
 assert.equal(report.insufficientTiles,1);
 assert.equal(report.errorTiles,1);
 assert.equal(report.regionFullyAnalyzed,false);
 assert.equal(report.commonValidPixels,30);
 approx(report.percentValidWithinAnalyzedTiles,30);
 approx(report.meanSlopeOnObservedPixels,.02);
 assert.equal(report.tiles[1].commonValidPixels,null);
 assert.equal(report.tiles[1].status,"insufficient");
 assert.equal(report.tiles[2].status,"error");
 assert.match(report.caveats.join(" "),/excludes tiles without/);
});

test("Stage 16: all unavailable tiles carry no fabricated NDVI or trend",()=>{
 const a=new SentinelMultiYearRegionAccumulator(2023,2025,8,["a"]);
 a.addUnavailable("a",area(14.40),"insufficient","No SCL-valid overlap");
 const result=a.finish();
 assert.equal(result.analyzedPixels,0);
 assert.equal(result.commonValidPixels,0);
 assert.equal(result.meanSlopeOnObservedPixels,null);
 assert.equal(result.percentValidWithinAnalyzedTiles,null);
 assert.equal(result.years[0].meanNdviOnObservedPixels,null);
});

test("Stage 16: reject duplicate tiles, non-disjoint areas, excessive regions and invalid QA",()=>{
 assert.throws(()=>new SentinelMultiYearRegionAccumulator(2023,2025,8,Array(17).fill("a")),/1..16/);
 assert.throws(()=>new SentinelMultiYearRegionAccumulator(2023,2025,8,["a","a"]),/distinct/);
 assert.throws(()=>new SentinelMultiYearRegionAccumulator(2023,2026,0,["a"]),/3–5/);
 const x=new SentinelMultiYearRegionAccumulator(2023,2025,8,["a","b","c"]);
 x.addResult("a",area(14.40),genuineTile());
 assert.throws(()=>x.addResult("a",area(14.41),genuineTile()),/duplicate/);
 assert.throws(()=>x.addResult("b",area(14.405),genuineTile()),/Overlapping/);
 const fake=genuineTile();
 fake.qa={...fake.qa,allSourceSclMasked:false};
 assert.throws(()=>x.addResult("b",area(14.41),fake),/source-backed/);
 assert.throws(()=>x.addResult("b",area(14.41),genuineTile({from:2022,to:2024})),/source-backed/);
 assert.throws(()=>x.addResult("b",area(14.41),genuineTile({resolution:20})),/different spectral sampling/);
 x.addResult("b",area(14.41),genuineTile());
 x.addUnavailable("c",area(14.42),"error","not cached");
 assert.equal(x.finish().processedTiles,3);
});

test("Stage 16: source geographic bounds require genuine non-overlapping WGS84 extent",()=>{
 const x=new SentinelMultiYearRegionAccumulator(2023,2025,8,["a","b"]);
 assert.throws(()=>x.addUnavailable("a",{west:14,east:13,south:50,north:51},"error","no"),/bounds/);
 assert.throws(()=>x.addUnavailable("a",{west:200,east:201,south:50,north:51},"error","no"),/bounds/);
 x.addResult("a",area(14.4),genuineTile());
 x.addResult("b",area(14.41),genuineTile());
 assert.equal(x.finish().analyzedTiles,2);
});
