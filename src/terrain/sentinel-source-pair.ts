/** Stage 21: bounded loading of the two ORIGINAL Sentinel acquisitions per
 * year. Processing order remains the same no matter which remote COG finishes
 * first; both sources must resolve or the annual cohort is unavailable.
 */
export type SentinelSourcePairConcurrency=1|2;

export async function loadSentinelSourcePair<T,V>(
 scenes:readonly [T,T],
 loader:(scene:T)=>Promise<V>,
 concurrency:SentinelSourcePairConcurrency=2
):Promise<[V,V]>{
 if(!Array.isArray(scenes)||scenes.length!==2||
   (concurrency!==1&&concurrency!==2)||typeof loader!=="function")
   throw new RangeError("Exactly two original Sentinel acquisitions and concurrency 1 or 2 are required");
 if(concurrency===1){
   const first=await loader(scenes[0]);
   const second=await loader(scenes[1]);
   return [first,second];
 }
 // Promise.all retains original STAC scene ordering; concurrent source
 // completion is never interpreted as acquisition chronology.
 const values=await Promise.all([loader(scenes[0]),loader(scenes[1])]);
 return [values[0],values[1]];
}
