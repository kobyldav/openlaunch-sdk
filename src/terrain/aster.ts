/** Discovery only: no remote elevation processing. NASA AST_L1A V004, DOI 10.5067/ASTER/AST_L1A.004. */
export interface AsterStereoGranule {id:string;title:string;startTime:string|null;links:string[];}
export async function discoverAsterStereo(options:{bounds:readonly [number,number,number,number];from:Date;to:Date;limit?:number;fetch?:typeof fetch;signal?:AbortSignal}):Promise<AsterStereoGranule[]>{
  const [w,s,e,n]=options.bounds,limit=options.limit??20;
  if(![w,s,e,n].every(Number.isFinite)||w< -180||e>180||s< -90||n>90||w>=e||s>=n||!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(+options.from)||!Number.isFinite(+options.to)||options.from>=options.to)throw new RangeError("Invalid ASTER search");
  const url=new URL("https://cmr.earthdata.nasa.gov/search/granules.json");
  url.search=new URLSearchParams({short_name:"AST_L1A",version:"004",bounding_box:options.bounds.join(","),temporal:options.from.toISOString()+","+options.to.toISOString(),page_size:String(limit),day_night_flag:"day"}).toString();
  const response=await (options.fetch??globalThis.fetch)(url,{headers:{Accept:"application/json"},signal:options.signal??AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error("ASTER CMR HTTP "+response.status);
  const body=await response.json() as {feed?:{entry?:unknown[]}};
  if(!Array.isArray(body.feed?.entry)||body.feed.entry.length>limit)throw new Error("Invalid CMR granule response");
  return body.feed.entry.flatMap(item=>{
    if(!item||typeof item!=="object")return [];
    const v=item as {id?:unknown;title?:unknown;time_start?:unknown;links?:{href?:unknown;rel?:unknown;inherited?:boolean}[]};
    if(typeof v.id!=="string"||typeof v.title!=="string")return [];
    return [{id:v.id,title:v.title,startTime:typeof v.time_start==="string"?v.time_start:null,links:(Array.isArray(v.links)?v.links:[]).filter(l=>l&&!l.inherited&&typeof l.rel==="string"&&l.rel.endsWith("/data#")&&typeof l.href==="string"&&l.href.startsWith("https://")).map(l=>l.href as string)}];
  });
}
