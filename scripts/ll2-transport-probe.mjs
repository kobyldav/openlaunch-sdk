#!/usr/bin/env node
/**
 * Minimal LL2 transport check: EXACTLY one SDK request, zero retries and
 * at most 10 seconds by default. No raw URLs, query strings, response bodies,
 * provider tokens or signed links appear in the report.
 *
 * node scripts/ll2-transport-probe.mjs            # production (uses 1 API call)
 * node scripts/ll2-transport-probe.mjs --dev      # development (stale data)
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {
 OpenLaunch, PRODUCTION_BASE_URL, DEVELOPMENT_BASE_URL,
 HttpError, RateLimitError, TimeoutError
} from "../dist/index.js";

export async function probeLl2({
 fetchImpl=globalThis.fetch, timeoutMs=10_000,
 baseUrl=PRODUCTION_BASE_URL
}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>30_000)
  throw new RangeError("LL2 probe timeout must be between 10 and 30000 ms");
 if(![PRODUCTION_BASE_URL,DEVELOPMENT_BASE_URL].includes(baseUrl))
  throw new RangeError("LL2 probe only accepts the two official fixed endpoints");
 const isDev=baseUrl===DEVELOPMENT_BASE_URL;
 let requests=0;
 const observations=[];
 const sdk=new OpenLaunch({
  baseUrl,fetch:fetchImpl,retries:0,cache:false,timeoutMs,
  onTelemetry:event=>{
   if(event.type==="request")requests++;
   else if(event.type==="response"&&!event.cached)
    observations.push({event:"http_response",status:event.status});
   else if(event.type==="retry")observations.push({event:"unexpected_retry"});
  }
 });
 const started=Date.now();
 try{
  const launch=await sdk.launches.next();
  return {
   provider:"launch_library_2",endpoint:isDev?"development":"production",
   outcome:"ok",elapsedMs:Date.now()-started,requests,
   status:observations.find(x=>x.event==="http_response")?.status??null,
   launchPresent:Boolean(launch),observations,
   note:isDev?"Development LL2 data is stale and incomplete.":"One real API call consumes quota."
  };
 }catch(error){
  const http=error instanceof HttpError;
  const status=http?error.status:null;
  const rateLimit=error instanceof RateLimitError;
  const timeout=error instanceof TimeoutError;
  const category=rateLimit?"rate_limited":
    http?"http_error":timeout?"sdk_timeout":
    error instanceof TypeError?"network_error":"sdk_or_provider_exception";
  return {
   provider:"launch_library_2",endpoint:isDev?"development":"production",
   outcome:category,elapsedMs:Date.now()-started,requests,
   status,
   errorType:error instanceof Error?error.name:"UnknownError",
   ...(rateLimit&&Number.isFinite(error.retryAfterSeconds)?
    {retryAfterSeconds:error.retryAfterSeconds}:{}),
   observations,
   note:"No retries. Do not interpret upstream errors as proof of an SDK defect."
  };
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length>1||args.some(a=>!["--dev","--help"].includes(a))){
  console.error("Usage: node scripts/ll2-transport-probe.mjs [--dev]");
  process.exitCode=2;
 }else if(args.includes("--help")){
  console.log("One LL2 request (no retries), 10s deadline. --dev uses stale development API.");
 }else{
  const result=await probeLl2({baseUrl:args.includes("--dev")?DEVELOPMENT_BASE_URL:PRODUCTION_BASE_URL});
  console.log(JSON.stringify(result,null,2));
  if(result.outcome!=="ok")process.exitCode=1;
 }
}
