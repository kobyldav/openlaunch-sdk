/** Stage 19 — one real historical Sentinel-2 acquisition pair per year
 * for every selected tile of a bounded region. This is a selection contract,
 * NEVER a replacement for scene-footprint checks or pixel-level SCL masks.
 */
export const SENTINEL_REGION_SOURCE_LOCK_VERSION=1;
export interface SentinelRegionalSceneCandidate{
 id:string;acquiredAt:string;cloudPercent:number|null;
}
export interface SentinelRegionLockedYear{
 year:number;scenes:SentinelRegionalSceneCandidate[];
}
export interface SentinelRegionSourceSelection{
 status:"real-sentinel-region-shared-scenes";
 version:1;from:number;to:number;month:number;cloud:number;
 seasons:SentinelRegionLockedYear[];
 /** Scene-wide ranking does not establish local SCL-valid pixels. */
 note:string;
}
const goodDate=(s:string):boolean=>
 typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(s)&&
 Number.isFinite(Date.parse(s))&&
 new Date(s).toISOString().startsWith(s.slice(0,10));
export function selectSharedSentinelRegionSources(
 from:number,to:number,month:number,cloud:number,
 regionalYearCatalogs:readonly {year:number;scenes:readonly SentinelRegionalSceneCandidate[]}[]
):SentinelRegionSourceSelection{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<2017||to>2100||
   to-from<2||to-from>4||!Number.isInteger(month)||month<1||month>12||
   !Number.isFinite(cloud)||cloud<0||cloud>100||
   !Array.isArray(regionalYearCatalogs)||regionalYearCatalogs.length!==to-from+1)
   throw new RangeError("Shared Sentinel region requires 3–5 consecutive years and real catalogs");
 const seasons:SentinelRegionLockedYear[]=[];
 for(let index=0;index<regionalYearCatalogs.length;index++){
   const catalog=regionalYearCatalogs[index]!;
   const year=from+index;
   if(catalog.year!==year||!Array.isArray(catalog.scenes))
     throw new RangeError("Shared Sentinel regional years must match ordered source catalogs");
   const valid=catalog.scenes.filter(scene=>
     typeof scene?.id==="string"&&/^[A-Za-z0-9_-]{5,120}$/.test(scene.id)&&
     goodDate(scene.acquiredAt)&&
     new Date(scene.acquiredAt).getUTCFullYear()===year&&
     new Date(scene.acquiredAt).getUTCMonth()+1===month&&
     (scene.cloudPercent===null||
       (typeof scene.cloudPercent==="number"&&Number.isFinite(scene.cloudPercent)&&
        scene.cloudPercent>=0&&scene.cloudPercent<=cloud))
   ).sort((a,b)=>(a.cloudPercent??101)-(b.cloudPercent??101)||
     Math.abs(new Date(a.acquiredAt).getUTCDate()-16)-
       Math.abs(new Date(b.acquiredAt).getUTCDate()-16)||
     a.acquiredAt.localeCompare(b.acquiredAt)||a.id.localeCompare(b.id));
   const seen=new Set<string>(),chosen:SentinelRegionalSceneCandidate[]=[];
   for(const scene of valid){
     if(seen.has(scene.id))continue;
     seen.add(scene.id);
     const at=Date.parse(scene.acquiredAt);
     if(chosen.some(older=>Math.abs(Date.parse(older.acquiredAt)-at)<4*86400000))
       continue;
     chosen.push({id:scene.id,acquiredAt:scene.acquiredAt,
       cloudPercent:scene.cloudPercent});
     if(chosen.length===2)break;
   }
   if(chosen.length!==2){
     const error=Error("No two genuinely distinct common regional Sentinel-2 acquisitions for "+
       year+"-"+String(month).padStart(2,"0")+
       ". Do not substitute another scene on individual tiles.");
     (error as Error&{code?:string}).code="OBSERVATION_INSUFFICIENT";
     throw error;
   }
   seasons.push({year,scenes:chosen.sort((a,b)=>
     a.acquiredAt.localeCompare(b.acquiredAt)||a.id.localeCompare(b.id))});
 }
 return {status:"real-sentinel-region-shared-scenes",
   version:SENTINEL_REGION_SOURCE_LOCK_VERSION,from,to,month,cloud,seasons,
   note:"One actual source pair per year was selected from the region-wide STAC catalog. "+
     "Every local pixel still requires independent SCL validity; footprints and COG access can leave entire tiles unavailable."};
}
export function verifySharedSentinelRegionSourceYears(
 years:readonly {year:number;scenes:readonly {sceneId:string;acquiredAt:string}[]}[],
 lock:Pick<SentinelRegionSourceSelection,"from"|"to"|"month"|"seasons">
):boolean{
 return Array.isArray(years)&&years.length===lock.to-lock.from+1&&
   years.every((group,i)=>group.year===lock.from+i&&
     group.scenes.length===2&&
     group.scenes.every((scene,j)=>
       scene.sceneId===lock.seasons[i]?.scenes[j]?.id&&
       scene.acquiredAt===lock.seasons[i]?.scenes[j]?.acquiredAt));
}
