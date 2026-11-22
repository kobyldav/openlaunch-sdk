/** Stage 22 — bounded in-process reuse of VERIFIED original HTTPS 206
 * COG metadata and compressed tile ranges. Not a raster cache: the caller
 * still decompresses, calibrates, projects and SCL-masks genuine pixels.
 *
 * Cache keys include the exact full STAC asset URL and exact requested byte
 * range. Only strong HTTP ETags authorize reuse; weak/missing validators
 * never enter the cache. A pinned strong ETag also guards new If-Range reads.
 */
export interface CogRangeCacheStats{
 maxResidentBytes:number;configuredMaxResidentBytes:number;
 residentBytes:number;entries:number;
 budgetShrinks:number;budgetGrows:number;shrinkEvictedBytes:number;minimumBudgetBytes:number;
 verifiedObjects:number;rangeCacheHits:number;rangeCacheMisses:number;
 reusedBytes:number;httpRequests:number;httpBytesRead:number;evictions:number;
}
type RangeEntry={bytes:Uint8Array;total:number;etag:string;url:string;metadata:boolean};
const STRONG_ETAG=/^"[^"\r\n]{1,256}"$/;
export const isStrongCogEtag=(etag:string|null):etag is string=>
 typeof etag==="string"&&STRONG_ETAG.test(etag);
export class CogRangeCache{
 private readonly ranges=new Map<string,RangeEntry>();
 private readonly validators=new Map<string,{total:number;etag:string}>();
 private resident=0;
 private budgetBytes:number;
 readonly configuredMaxResidentBytes:number;
 private shrinks=0;private grows=0;private shrinkEvicted=0;
 private minimumBudget:number;
 private hits=0;private misses=0;private reused=0;
 private requests=0;private fetched=0;private evicted=0;
 constructor(maxResidentBytes=64*1024*1024,readonly maxEntries=256){
   if(!Number.isSafeInteger(maxResidentBytes)||maxResidentBytes<0||
     maxResidentBytes>128*1024*1024||
     !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>1024)
     throw new RangeError("COG in-process cache must be 0..128 MiB and 1..1024 ranges");
   this.budgetBytes=maxResidentBytes;
   this.configuredMaxResidentBytes=maxResidentBytes;
   this.minimumBudget=maxResidentBytes;
 }
 get maxResidentBytes():number{return this.budgetBytes;}
 /** Stage 23: change only the memory budget, NEVER source URLs/ETags.
  * Evict non-metadata TIFF blocks first. Source validators are retained,
  * so a version change cannot silently combine old metadata with new pixels.
  * The configured maximum is immutable: pressure relief cannot oversubscribe.
  */
 resizeBudgetBytes(next:number):number{
   if(!Number.isSafeInteger(next)||next<0||
     next>this.configuredMaxResidentBytes)
     throw new RangeError("Adaptive source budget exceeds configured COG memory limit");
   if(next===this.budgetBytes)return 0;
   const shrinking=next<this.budgetBytes;
   if(shrinking)this.shrinks++;
   else this.grows++;
   this.budgetBytes=next;
   this.minimumBudget=Math.min(this.minimumBudget,next);
   const before=this.resident;
   this.evictToBudget();
   if(shrinking)this.shrinkEvicted+=before-this.resident;
   return before-this.resident;
 }
 private evictToBudget():void{
   while(this.resident>this.budgetBytes||this.ranges.size>this.maxEntries){
     // Preserve original TIFF IFD metadata before large compressed chunks
     // whenever possible, but a hard budget can evict headers too.
     let oldest:string|undefined;
     for(const [key,entry] of this.ranges)if(!entry.metadata){
       oldest=key;break;
     }
     oldest??=this.ranges.keys().next().value;
     const old=this.ranges.get(oldest!)!;
     this.ranges.delete(oldest!);this.resident-=old.bytes.byteLength;this.evicted++;
   }
 }
 private key(url:string,start:number,length:number){
   return JSON.stringify([url,start,length]);
 }
 private validRange(url:string,start:number,length:number){
   if(typeof url!=="string"||!url.startsWith("https://")||
     !Number.isSafeInteger(start)||start<0||
     !Number.isSafeInteger(length)||length<1||length>64*1024*1024)
     throw new RangeError("COG cache requires exact authenticated HTTPS URL and bounded byte offset");
 }
 validatorFor(url:string):string|null{
   // Even a temporary 0 MiB budget retains SOURCE IDENTITY. An original
   // strong ETag pin prevents mixing earlier validated bytes with later
   // network responses when pressure forces all TIFF blocks out of RAM.
   return this.validators.get(url)?.etag??null;
 }
 get(url:string,start:number,length:number):{bytes:Uint8Array;total:number;etag:string}|null{
   this.validRange(url,start,length);
   if(this.maxResidentBytes===0)return null;
   const k=this.key(url,start,length),stored=this.ranges.get(k);
   if(!stored){this.misses++;return null;}
   const pinned=this.validators.get(url);
   if(!pinned||pinned.etag!==stored.etag||pinned.total!==stored.total)
     throw new RangeError("COG cached range failed original source validator match");
   this.ranges.delete(k);this.ranges.set(k,stored);
   this.hits++;this.reused+=stored.bytes.byteLength;
   return {bytes:stored.bytes.slice(),total:stored.total,etag:stored.etag};
 }
 /** Call ONLY after checking 206 + Content-Range and exact response body. */
 accept(url:string,start:number,length:number,bytes:Uint8Array,total:number,etag:string|null){
   this.validRange(url,start,length);
   if(!Number.isSafeInteger(total)||total<1||start>=total||
     !(bytes instanceof Uint8Array)||bytes.byteLength<1||
     bytes.byteLength>length||bytes.byteLength>total-start)
     throw new RangeError("Cannot cache invalid original TIFF byte range");
   this.requests++;this.fetched+=bytes.byteLength;
   const prior=this.validators.get(url);
   if(prior&&(prior.total!==total||prior.etag!==etag))
     throw new RangeError("Original COG ETag or source size changed: refusing mixed source bytes");
   // Never silently drop source-version validation under a 0-byte RAM
   // budget. We only disable STORAGE, not scientific provenance checks.
   if(this.maxResidentBytes===0)return;
   // A missing or weak HTTP ETag is not a safe version identity. Don't use
   // Last-Modified alone: it has only second precision and can be ambiguous.
   if(!isStrongCogEtag(etag))return;
   if(!prior){
     this.validators.set(url,{total,etag});
     if(this.validators.size>128){
       const oldest=this.validators.keys().next().value!;
       this.validators.delete(oldest);
       for(const [k,v] of this.ranges)if(v.url===oldest){
         this.ranges.delete(k);this.resident-=v.bytes.byteLength;this.evicted++;
       }
     }
   }
   if(bytes.byteLength>this.maxResidentBytes)return;
   const k=this.key(url,start,length);
   const existing=this.ranges.get(k);
   if(existing){this.resident-=existing.bytes.byteLength;this.ranges.delete(k);}
   // The TIFF header is tiny compared with compressed raster blocks, but
   // required for EVERY independently verified AOI. Protect it from the
   // large-block LRU churn that otherwise evicts all 30 original STAC
   // band headers before the next regional tile starts.
   this.ranges.set(k,{url,bytes:bytes.slice(),total,etag,
     metadata:start===0&&length<=2*1024*1024});
   this.resident+=bytes.byteLength;
   this.evictToBudget();
 }
 snapshot():CogRangeCacheStats{
   return {
     maxResidentBytes:this.maxResidentBytes,
     configuredMaxResidentBytes:this.configuredMaxResidentBytes,
     budgetShrinks:this.shrinks,budgetGrows:this.grows,
     shrinkEvictedBytes:this.shrinkEvicted,minimumBudgetBytes:this.minimumBudget,
     residentBytes:this.resident,
     entries:this.ranges.size,verifiedObjects:this.validators.size,
     rangeCacheHits:this.hits,rangeCacheMisses:this.misses,
     reusedBytes:this.reused,httpRequests:this.requests,
     httpBytesRead:this.fetched,evictions:this.evicted
   };
 }
}
