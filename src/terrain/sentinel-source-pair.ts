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
 // Wait for BOTH genuine COG jobs to finish even when one fails.
 // Promise.all alone rejects early and would let the next tile start while
 // an old acquisition was still consuming the global two-job source budget.
 // Promise.allSettled keeps the original STAC chronology for results/errors.
 const settled=await Promise.allSettled([loader(scenes[0]),loader(scenes[1])]);
 if(settled[0].status==="rejected")throw settled[0].reason;
 if(settled[1].status==="rejected")throw settled[1].reason;
 return [settled[0].value,settled[1].value];
}
