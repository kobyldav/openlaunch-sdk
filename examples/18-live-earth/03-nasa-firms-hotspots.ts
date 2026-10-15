import { SpaceMapClient } from "../../src/index.js";
// Network/credentials required: call ONLY from your backend/Cloudflare Worker.
// Never bundle the private key into client-side JavaScript.
export async function loadFiresForCzechia(firmsMapKey:string){
  const maps=new SpaceMapClient({firmsMapKey});
  const result=await maps.activeFires([12.09,48.55,18.86,51.06],{
    source:"VIIRS_NOAA21_NRT",days:1,
  });
  return result.observations.map(p=>({
    coordinates:[p.longitude,p.latitude] as const,
    observedAt:p.acquiredAt,frpMW:p.frpMegawatts,source:p.satellite,
  }));
}
