import {
  OpenLaunch,bbox,inspectEoProduct,
  type StacItem,
} from "../../src/index.js";

// NETWORK: yes. Provide a genuine trusted, signed, one-band Deflate COG scene.
const sdk=new OpenLaunch();
const aoi=bbox(14.41,50.07,14.43,50.09);
const scenes=await sdk.earth.searchImagery({
  area:aoi,from:new Date("2026-09-01"),to:new Date("2026-10-13"),
  source:"planetary-computer",limit:5,
});
const scene:StacItem|undefined=scenes.features[0];
if(!scene){console.log("No public STAC scene for area/date");}
else{
  const assets=inspectEoProduct(scene).assets;
  console.table(assets.map(a=>({key:a.key,type:a.mediaType,gsd:a.groundSampleDistanceM})));
  const selected=assets.find(a=>a.key==="B04");
  if(selected){
    const host=new URL(selected.href).hostname;
    // Use only deliberately audited provider hostnames in server applications.
    // This example is a reference pattern, not a guarantee of URL availability.
    const result=await sdk.earth.readRasterWindow(scene,selected.key,aoi,{
      allowedHosts:[host],maxPixels:300_000,
    });
    console.log(result.raster.width,result.raster.height,result.requestedTiles);
  }
}
