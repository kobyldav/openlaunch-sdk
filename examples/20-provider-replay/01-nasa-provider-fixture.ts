import {NasaClient} from "../../src/index.js";
// Reproducible offline contract: URL construction, NASA API key, parsed payload.
const seen:string[]=[];
const nasa=new NasaClient({apiKey:"TEST_KEY",cache:false,fetch:async input=>{
 const url=String(input);seen.push(url);
 if(!url.startsWith("https://api.nasa.gov/"))throw Error("Unexpected NASA endpoint");
 return new Response(JSON.stringify({source:"fixture",url}),{headers:{"content-type":"application/json"}});
}});
await nasa.neoFeed("2026-10-17","2026-10-18");
await nasa.neoLookup("123");
await nasa.donki("CME","2026-10-01","2026-10-17");
await nasa.epicEnhanced("2026-10-17");
await nasa.techTransfer("titanium");
if(seen.length!==5||seen.some(u=>!u.includes("api_key=TEST_KEY")))throw Error("NASA path/key contract failed");
if(!seen.some(u=>u.includes("/neo/rest/v1/neo/123"))||
 !seen.some(u=>u.includes("DONKI/CME"))||!seen.some(u=>u.includes("EPIC/api/enhanced")))throw Error("NASA method routes failed");
console.log("PASS fixture NASA provider requests",seen.length);
