/** Time-ordered, pixel-aligned *observed* Sentinel-2 L2A NDVI differences.
 *
 * No land-cover classification or causal change claim is made: annual
 * phenology, acquisition timing, viewing geometry and L2A processing may all
 * affect NDVI. Missing SCL/cloud/radiometric pixels NEVER contribute to delta.
 * The output represents a raster calculation, not a change-detection proof.
 */
import type {SentinelTerrainOverlay} from "./sentinel-overlay.js";

export const SENTINEL_NDVI_CHANGE_VERSION=1;
export interface SentinelNdviEvidence extends Pick<SentinelTerrainOverlay,
  "status"|"version"|"sceneId"|"acquiredAt"|"area"|"width"|"height"|
  "groundSamplingM"|"grid"|"statistics"|"qa"|"ndviValues"|"source"> {}
export interface SentinelNdviChangeOptions{
  /** |after-before| >= threshold counts as large; default 0.15 NDVI unit. */
  thresholdNdvi?:number;
  /** Abort visual reporting if there is insufficient genuine overlap. */
  minOverlapPixels?:number;
}
export interface SentinelNdviChange{
  status:"real-sentinel-ndvi-comparison";
  version:number;
  before:{sceneId:string;acquiredAt:string;validPixels:number};
  after:{sceneId:string;acquiredAt:string;validPixels:number};
  source:string;
  area:SentinelTerrainOverlay["area"];
  grid:SentinelTerrainOverlay["grid"];
  width:number;height:number;groundSamplingM:number;
  /** Signed after NDVI minus before NDVI, NaN where either source invalid. */
  deltaValues:Float32Array;
  /** 8-bit palette only; never treat these colors as original EO pixels. */
  deltaRgba:Uint8Array;
  statistics:{
    totalPixels:number;
    baselineValidPixels:number;
    followupValidPixels:number;
    overlapPixels:number;
    /** Percent of identical registered grid with valid SCL in *both* scenes. */
    overlapPercent:number;
    missingEitherPixels:number;
    increasedPixels:number;decreasedPixels:number;stablePixels:number;
    thresholdNdvi:number;
    meanDeltaNdvi:number;minDeltaNdvi:number;maxDeltaNdvi:number;
  };
  qa:{bothSclMasked:true;sameGrid:true;unpairedPixelsExcluded:true};
  caveats:string[];
}
function verified(e:SentinelNdviEvidence,label:string){
 if(!e||e.status!=="real-sentinel2-observation"||e.version!==2||
    !/^[A-Za-z0-9_-]{5,120}$/.test(e.sceneId)||
    typeof e.source!=="string"||!e.source.includes("Sentinel-2")||
    !Number.isFinite(Date.parse(e.acquiredAt))||
    e.qa?.sclMask!==true||e.grid?.crs!=="EPSG:3857"||
    !Number.isInteger(e.width)||!Number.isInteger(e.height)||
    e.width<2||e.height<2||e.width*e.height>50000||
    !Number.isFinite(e.groundSamplingM)||e.groundSamplingM<10||
    !Array.isArray(e.area)||e.area.length!==4||
    e.area.some(n=>!Number.isFinite(n))||
    !Array.isArray(e.grid.transform)||e.grid.transform.length!==6||
    e.grid.transform.some(n=>!Number.isFinite(n))||
    !(e.ndviValues instanceof Float32Array)||
    e.ndviValues.length!==e.width*e.height)
   throw new RangeError(label+" is not a valid georeferenced, masked Sentinel observation");
 let count=0;
 for(const v of e.ndviValues){
   if(Number.isNaN(v))continue; // explicit source cloud/NoData mask
   if(!Number.isFinite(v)||v< -1.00001||v>1.00001)
     throw new RangeError(label+" includes invalid reflectance-derived NDVI");
   count++;
 }
 if(count!==e.statistics?.validPixels)
   throw new RangeError(label+" SCL mask/pixel count mismatch");
}
function color(delta:number,threshold:number):[number,number,number]{
 // Real delta values -> explanatory diverging palette, not raw satellite RGB.
 if(delta<=-threshold){
   const tone=Math.min(1,Math.abs(delta)/.7);
   return [Math.round(160+68*tone),Math.round(125-75*tone),
     Math.round(160-95*tone)];
 }
 if(delta>=threshold){
   const tone=Math.min(1,delta/.7);
   return [Math.round(90-67*tone),Math.round(176-54*tone),
     Math.round(135-30*tone)];
 }
 return [202,202,185]; // valid, but no large change at chosen threshold
}
/** Compare exactly the SAME EPSG:3857 pixel centers. No interpolation of
 * missing pixels, no synthetic zero NDVI, no unvalidated scene pairing.
 * Each input must come from the Stage 11 SDK raster loader and mask.
 */
export function compareSentinelNdviScenes(
 before:SentinelNdviEvidence,after:SentinelNdviEvidence,
 options:SentinelNdviChangeOptions={}
):SentinelNdviChange{
 const threshold=options.thresholdNdvi??.15,minOverlap=options.minOverlapPixels??16;
 if(!Number.isFinite(threshold)||threshold<=0||threshold>1||
    !Number.isInteger(minOverlap)||minOverlap<4||minOverlap>50000)
   throw new RangeError("NDVI change threshold must be (0,1] and overlap >=4 pixels");
 verified(before,"Before scene");verified(after,"After scene");
 if(before.sceneId===after.sceneId||
    Date.parse(before.acquiredAt)>=Date.parse(after.acquiredAt))
   throw new RangeError("Choose two different chronological Sentinel acquisitions");
 if(before.width!==after.width||before.height!==after.height||
    before.groundSamplingM!==after.groundSamplingM||
    before.area.some((v,i)=>v!==after.area[i])||
    before.grid.transform.some((v,i)=>v!==after.grid.transform[i]))
   throw new RangeError("Sentinel scenes use different pixel grids: cannot pair mismatched pixels");
 const n=before.width*before.height,deltas=new Float32Array(n);
 deltas.fill(NaN);
 const rgba=new Uint8Array(n*4);
 let overlap=0,increased=0,decreased=0,stable=0,sum=0,min=Infinity,max=-Infinity;
 for(let i=0;i<n;i++){
   const b=before.ndviValues[i]!,a=after.ndviValues[i]!;
   if(!Number.isFinite(a)||!Number.isFinite(b))continue;
   const delta=a-b;deltas[i]=delta;overlap++;
   if(delta>=threshold)increased++;
   else if(delta<=-threshold)decreased++;
   else stable++;
   min=Math.min(min,delta);max=Math.max(max,delta);sum+=delta;
   rgba.set([...color(delta,threshold),255],i*4);
 }
 if(overlap<minOverlap)
   throw new Error("Insufficient same-pixel clear-sky overlap ("+overlap+
     " pixels; required "+minOverlap+"). Refusing invented NDVI change.");
 return {
   status:"real-sentinel-ndvi-comparison",version:SENTINEL_NDVI_CHANGE_VERSION,
   before:{sceneId:before.sceneId,acquiredAt:before.acquiredAt,
     validPixels:before.statistics.validPixels},
   after:{sceneId:after.sceneId,acquiredAt:after.acquiredAt,
     validPixels:after.statistics.validPixels},
   source:"Copernicus Sentinel-2 L2A / Element84 Earth Search public COG; "+
     "pairwise cloud-masked calibrated NDVI",
   area:before.area,grid:before.grid,
   width:before.width,height:before.height,groundSamplingM:before.groundSamplingM,
   deltaValues:deltas,deltaRgba:rgba,
   statistics:{
     totalPixels:n,baselineValidPixels:before.statistics.validPixels,
     followupValidPixels:after.statistics.validPixels,
     overlapPixels:overlap,overlapPercent:overlap/n*100,
     missingEitherPixels:n-overlap,increasedPixels:increased,
     decreasedPixels:decreased,stablePixels:stable,thresholdNdvi:threshold,
     meanDeltaNdvi:sum/overlap,minDeltaNdvi:min,maxDeltaNdvi:max
   },
   qa:{bothSclMasked:true,sameGrid:true,unpairedPixelsExcluded:true},
   caveats:[
     "Delta NDVI = calibrated newer L2A NDVI minus older L2A NDVI at exactly matching pixel centers.",
     "Only SCL-accepted, radiometrically valid pixels in BOTH actual scenes are compared; holes remain transparent.",
     "Positive/negative differences are spectral changes, NOT proof of construction, deforestation, vegetation health, or cause.",
     "Different dates, sun geometry, atmospheric correction, seasonal phenology and SCL errors can cause apparent changes.",
     "Threshold .15 is a visual analysis choice, not a statistically calibrated detection significance level.",
     "No new elevation or photogrammetric building heights were created. ČÚZK Bpv 3D geometry is unchanged."
   ]
 };
}
