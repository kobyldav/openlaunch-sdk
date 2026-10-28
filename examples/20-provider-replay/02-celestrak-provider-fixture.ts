import {CelesTrakClient} from "../../src/index.js";
// Strictly offline query contract; no actual TLE/OMM validity is implied.
const seen:string[]=[];
const api=new CelesTrakClient({cache:false,fetch:async input=>{
 const url=String(input);seen.push(url);
 return new Response(JSON.stringify([{OBJECT_NAME:"ISS",NORAD_CAT_ID:25544}]),{
  headers:{"content-type":"application/json"}});
}});
const iss=await api.byCatalogNumber(25544);
await api.byName("ISS");
await api.byGroup("STATIONS");
if(iss[0]?.NORAD_CAT_ID!==25544||
 !seen.some(s=>s.includes("CATNR=25544"))||
 !seen.some(s=>s.includes("NAME=ISS"))||
 !seen.some(s=>s.includes("GROUP=STATIONS")))throw Error("CelesTrak query mapping failed");
console.log("PASS fixture CelesTrak endpoint routes",seen.length);
