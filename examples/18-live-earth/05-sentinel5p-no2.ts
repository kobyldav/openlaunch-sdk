import { SpaceMapClient, bbox } from "../../src/index.js";
// Network/credentials required; Copernicus Sentinel Hub returns colorized PNG,
// not a calibrated numerical local-air-quality sensor or confirmed capture time.
export async function no2Map(clientId:string,clientSecret:string){
  const maps=new SpaceMapClient({copernicus:{clientId,clientSecret}});
  return maps.airQuality({
    area:bbox(12.09,48.55,18.86,51.06),
    from:new Date("2026-10-13T00:00:00Z"),
    to:new Date("2026-10-14T00:00:00Z"),
    species:"NO2",minQa:75,timeliness:"NRTI",
    width:512,height:512,
  });
}
