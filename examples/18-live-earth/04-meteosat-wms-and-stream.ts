import { SpaceMapClient } from "../../src/index.js";
// Network required for capabilities; static video descriptor doesn't verify uptime.
export async function findEumetviewLayers(){
  const maps=new SpaceMapClient();
  const discovered=await maps.meteosatCapabilities();
  // Select layer ID based on actual WMS capabilities, never invent an identifier.
  return discovered.layers;
}
const stream=new SpaceMapClient().videoStream("meteosat-europe-live");
console.log(stream.embedUrl,stream.officialSourceUrl,stream.documentedLatencyMinutes);
