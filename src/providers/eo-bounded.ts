/** Safe bounded HTTPS response reader for known, official EO APIs.
 * Do not accept arbitrary user URLs here. HTTP redirects are rejected. */
export interface BoundedHttpOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string,string>;
}
export async function boundedProviderGet(url:string,options:BoundedHttpOptions={}):Promise<{bytes:Uint8Array;contentType:string}>{
  const target=new URL(url);
  if(target.protocol!=="https:"||target.username||target.password)throw new TypeError("HTTPS URL without embedded credentials required");
  const maxBytes=options.maxBytes??8*1024*1024;
  const timeoutMs=options.timeoutMs??15_000;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32*1024*1024)throw new RangeError("Invalid maxBytes (up to 32 MiB)");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120_000)throw new RangeError("Invalid timeoutMs");
  const fetchImpl=options.fetch??globalThis.fetch;
  if(!fetchImpl)throw new Error("Fetch implementation required");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(target.toString(),{
      // Workers rejects redirect:"error" before issuing a subrequest.
      // "manual" is supported by Workers and Node. Treat every non-2xx,
      // including 3xx, as a provider error; never follow URLs with credentials.
      method:"GET",redirect:"manual",signal:controller.signal,...(options.headers?{headers:options.headers}:{}),
    });
    if(!response.ok)throw new Error("Provider HTTP "+response.status);
    const length=response.headers.get("content-length");
    if(length!==null&&Number(length)>maxBytes)throw new RangeError("Provider payload exceeds maxBytes");
    if(!response.body)throw new Error("Provider returned no response body");
    const chunks:Uint8Array[]=[];let total=0;
    const reader=response.body.getReader();
    try {
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(value){
          total+=value.byteLength;
          if(total>maxBytes){
            await reader.cancel("maxBytes exceeded");
            throw new RangeError("Provider response exceeds maxBytes");
          }
          chunks.push(value);
        }
      }
    }finally{reader.releaseLock();}
    const bytes=new Uint8Array(total);let cursor=0;
    for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}
    return {bytes,contentType:response.headers.get("content-type")??"application/octet-stream"};
  }finally{clearTimeout(timeout);}
}
export function assertUtcDay(date:Date|string):string{
  const d=date instanceof Date?date:new Date(date);
  if(!Number.isFinite(d.getTime()))throw new RangeError("Invalid calendar date");
  return d.toISOString().slice(0,10);
}
export function assertUtcDate(date:Date|string):string{
  const d=date instanceof Date?date:new Date(date);
  if(!Number.isFinite(d.getTime()))throw new RangeError("Invalid UTC timestamp");
  return d.toISOString();
}
export function boundedImageDimensions(width:number,height:number,maxPixels=4_194_304):void{
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    width>8192||height>8192||width*height>maxPixels)
    throw new RangeError("Image dimensions outside supported pixel bounds");
}
