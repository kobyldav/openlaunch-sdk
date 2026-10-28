import { buildWebMapDaily, type WebMapClients } from "./web-map.js";
import { fetchWebMapDailyTile, type WebMapDailyTileRequest, type WebMapDailyTileResult,
  type WebMapDailyTileOptions } from "./web-map-tile.js";

/** An isolate-local verified-image cache. No negative caching or shared persistence. */
export interface WebMapTileCacheOptions {
  /** Default 5 minutes; 0 disables storage. Hard maximum 1 hour. */
  ttlMs?:number;
  /** Default 32 cached tiles; hard limit 128. */
  maxEntries?:number;
  /** Default 8 MiB of binary tile bytes; hard maximum 32 MiB. */
  maxTotalBytes?:number;
}
export type WebMapTileCacheStatus="hit"|"fetched"|"shared";
export interface CachedWebMapDailyTileResult extends WebMapDailyTileResult {
  /** Hit = verified cached copy, fetched = own network request, shared = joined in-flight request. */
  cacheStatus:WebMapTileCacheStatus;
}
export interface WebMapDailyTileBatchRequest {
  tiles: readonly WebMapDailyTileRequest[];
  /** Default 3, maximum 4 concurrent unique fetches. */
  concurrency?:number;
}
export interface WebMapDailyTileBatchResult {
  results:CachedWebMapDailyTileResult[];
  requested:number;
  uniqueRequested:number;
  /** Per-item failures do not abort other tiles. */
  available:number;
  missing:number;
  unavailable:number;
  invalid:number;
  cacheHits:number;
  shared:number;
  verifiedAcquisition:false;
  /** True only for an actual image signature; no claim of pixel coverage. */
  catalogOnly:false;
}
export interface WebMapTileCacheStats {
  entries:number;
  bytes:number;
  inFlight:number;
  hits:number;
  fetches:number;
  joined:number;
  evictions:number;
}
interface CacheEntry {value:WebMapDailyTileResult;bytes:number;expiresAt:number;}

/** Always make fresh copies of bytes at cache boundaries. */
function copyTile<T extends WebMapDailyTileResult>(tile:T):T {
  return {...tile,image:tile.image?.slice()??null};
}
function boundedInt(value:number|undefined,defaultValue:number,min:number,max:number,name:string):number{
  const x=value??defaultValue;
  if(!Number.isSafeInteger(x)||x<min||x>max)
    throw new RangeError(name+" must be between "+min+" and "+max);
  return x;
}
/**
 * A canonical key is derived from trusted SDK-generated descriptors, never
 * from a caller-supplied arbitrary URL. Invalid XYZ rejected even on hits.
 */
function keyForTile(clients:Pick<WebMapClients,"nasaDailyTiles">,r:WebMapDailyTileRequest):string{
  const descriptor=buildWebMapDaily(clients,r);
  if(!Number.isSafeInteger(r.z)||r.z<0||r.z>descriptor.maxZoom||
     !Number.isSafeInteger(r.x)||r.x<0||r.x>=2**r.z||
     !Number.isSafeInteger(r.y)||r.y<0||r.y>=2**r.z)
    throw new RangeError("NASA GIBS XYZ coordinates must fit the selected zoom");
  return [r.layer,descriptor.requestedDate,r.z,r.x,r.y].join("|");
}
/**
 * Explicitly bounded in-memory LRU cache + in-flight deduplication for
 * server-side instances of OpenLaunch SDK. The cache is NOT global and cannot
 * be assumed shared across Cloudflare workers or Node processes.
 */
export class WebMapTileCache {
  private readonly store=new Map<string,CacheEntry>();
  private readonly inflight=new Map<string,Promise<WebMapDailyTileResult>>();
  private totalBytes=0;
  private generation=0;
  private hits=0;
  private fetches=0;
  private joined=0;
  private evictions=0;
  private readonly ttlMs:number;
  private readonly maxEntries:number;
  private readonly maxTotalBytes:number;
  constructor(
    private readonly clients:Pick<WebMapClients,"nasaDailyTiles">,
    private readonly fetchOptions:WebMapDailyTileOptions={},
    options:WebMapTileCacheOptions={},
    private readonly now:()=>number=()=>Date.now(),
  ){
    this.ttlMs=boundedInt(options.ttlMs,300_000,0,3_600_000,"ttlMs");
    this.maxEntries=boundedInt(options.maxEntries,32,1,128,"maxEntries");
    this.maxTotalBytes=boundedInt(options.maxTotalBytes,8*1024*1024,8,32*1024*1024,"maxTotalBytes");
  }
  /** Invalidate all stored images. Existing in-flight requests remain bounded and still resolve. */
  clear():void{
    this.generation++;
    this.store.clear();this.totalBytes=0;
  }
  stats():WebMapTileCacheStats{
    return {entries:this.store.size,bytes:this.totalBytes,inFlight:this.inflight.size,
      hits:this.hits,fetches:this.fetches,joined:this.joined,evictions:this.evictions};
  }
  private evict(key:string):void{
    const current=this.store.get(key);
    if(!current)return;
    this.totalBytes-=current.bytes;
    this.store.delete(key);
    this.evictions++;
  }
  private remember(key:string,value:WebMapDailyTileResult):void{
    if(this.ttlMs===0||value.status!=="available"||!value.imageVerified||!value.image||
       value.byteLength!==value.image.byteLength||
       value.byteLength>this.maxTotalBytes)return;
    const at=this.now();
    // Do not cache a new response if a cache clear occurred during the fetch?
    // The cache is isolate-local and caller may manually clear after a fetch.
    const existing=this.store.get(key);
    if(existing)this.evict(key);
    while(this.store.size>=this.maxEntries||this.totalBytes+value.byteLength>this.maxTotalBytes) {
      const oldest=this.store.keys().next().value;
      if(oldest===undefined)break;
      this.evict(oldest);
    }
    this.store.set(key,{
      value:copyTile(value),bytes:value.byteLength,expiresAt:at+this.ttlMs,
    });
    this.totalBytes+=value.byteLength;
  }
  async get(request:WebMapDailyTileRequest):Promise<CachedWebMapDailyTileResult>{
    const key=keyForTile(this.clients,request);
    const entry=this.store.get(key);
    if(entry){
      if(entry.expiresAt>this.now()){
        // Map insertion order implements true LRU, not first-created eviction.
        this.store.delete(key);this.store.set(key,entry);
        this.hits++;
        return {...copyTile(entry.value),cacheStatus:"hit"};
      }
      this.evict(key);
    }
    const pending=this.inflight.get(key);
    if(pending){
      this.joined++;
      const result=await pending;
      return {...copyTile(result),cacheStatus:"shared"};
    }
    this.fetches++;
    const generation=this.generation;
    // Avoid async ordering issues: insert promise before any subsequent get().
    const operation=fetchWebMapDailyTile(this.clients,request,this.fetchOptions);
    this.inflight.set(key,operation);
    try{
      const result=await operation;
      if(generation===this.generation)this.remember(key,result);
      return {...copyTile(result),cacheStatus:"fetched"};
    }finally{
      if(this.inflight.get(key)===operation)this.inflight.delete(key);
    }
  }
  async batch(request:WebMapDailyTileBatchRequest):Promise<WebMapDailyTileBatchResult>{
    const tiles=request.tiles;
    if(!Array.isArray(tiles)||tiles.length<1||tiles.length>16)
      throw new RangeError("Daily tile batch supports 1..16 tiles");
    const concurrency=boundedInt(request.concurrency,3,1,4,"concurrency");
    // Validate every coordinate/date before first external request (fail atomically).
    const keys=tiles.map(tile=>keyForTile(this.clients,tile));
    const output=new Array<CachedWebMapDailyTileResult>(tiles.length);
    let cursor=0;
    const work=async()=>{
      while(cursor<tiles.length){
        const i=cursor++;
        output[i]=await this.get(tiles[i]!);
      }
    };
    await Promise.all(Array.from({length:Math.min(concurrency,tiles.length)},work));
    return {
      results:output,requested:tiles.length,uniqueRequested:new Set(keys).size,
      available:output.filter(x=>x.status==="available").length,
      missing:output.filter(x=>x.status==="missing").length,
      unavailable:output.filter(x=>x.status==="unavailable").length,
      invalid:output.filter(x=>x.status==="invalid").length,
      cacheHits:output.filter(x=>x.cacheStatus==="hit").length,
      shared:output.filter(x=>x.cacheStatus==="shared").length,
      verifiedAcquisition:false,catalogOnly:false,
    };
  }
}
