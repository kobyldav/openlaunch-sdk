import type {AreaOfInterest} from "../geo/types.js";
import { CopernicusClient, type ProcessedRaster } from "./copernicus.js";
import { createCopernicusStac, type StacFeatureCollection, type StacItem } from "./stac.js";
import { assertUtcDate, boundedImageDimensions } from "./eo-bounded.js";

export type S5pSpecies="NO2"|"SO2"|"CO"|"O3"|"CH4"|"HCHO"|"AER_AI_340_380";
export const S5P_SPECIES=Object.freeze({
  NO2:{max:0.0002,unit:"mol/m²",label:"Tropospheric NO₂ column"},
  SO2:{max:0.01,unit:"mol/m²",label:"SO₂ column"},
  CO:{max:0.1,unit:"mol/m²",label:"CO column"},
  O3:{max:0.36,unit:"mol/m²",label:"Ozone total column"},
  CH4:{max:2200,unit:"ppb",label:"Methane column mixing ratio"},
  HCHO:{max:0.001,unit:"mol/m²",label:"Formaldehyde column"},
  AER_AI_340_380:{max:5,unit:"unitless",label:"UV aerosol index"},
} as const);
export interface S5pRasterRequest{
  area:AreaOfInterest;
  from:Date|string;
  to:Date|string;
  species:S5pSpecies;
  width?:number;height?:number;
  minQa?:number;
  timeliness?:"NRTI"|"OFFL"|"RPRO";
}
export function s5pVisualScript(species:S5pSpecies):string{
  const p=S5P_SPECIES[species];
  if(!p)throw new RangeError("Unsupported TROPOMI species");
  // All inputs are exact whitelisted band identifiers; no evalscript injection.
  return `//VERSION=3
function setup(){return {input:["${species}","dataMask"],output:{bands:4,sampleType:"AUTO"}};}
function evaluatePixel(s){
  var v=Math.max(0,Math.min(1,s.${species}/${p.max}));
  return [v,Math.max(0,1-Math.abs(2*v-1)),1-v,s.dataMask];
}`;
}
/** Operational Sentinel Hub processing; image is colorized, NOT geophysical pixel array. */
export class Sentinel5pClient{
  private readonly catalog;
  constructor(private readonly copernicus:CopernicusClient=new CopernicusClient()){
    this.catalog=this.copernicus.stac;
  }
  async scenes(options:{area:AreaOfInterest;from:Date|string;to:Date|string;limit?:number;collection?:string}):Promise<StacFeatureCollection>{
    const from=assertUtcDate(options.from),to=assertUtcDate(options.to);
    if(from>to)throw new RangeError("Invalid Sentinel-5P time interval");
    const limit=options.limit??20;
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new RangeError("Invalid STAC limit");
    // CDSE's product STAC publishes per-product collection names. Do not
    // assume they match Sentinel Hub's Process API dataType identifier.
    const collection=options.collection??"sentinel-5p-l2-no2-offl";
    if(!/^[a-z0-9-]{3,110}$/.test(collection))throw new RangeError("Invalid S5P STAC collection");
    return this.catalog.search({
      collections:[collection],intersects:options.area.geometry,
      datetime:{from,to},limit,
      sortby:[{field:"properties.datetime",direction:"desc"}],
    });
  }
  async render(request:S5pRasterRequest):Promise<{
    bytes:Uint8Array;contentType:string;unit:string;species:S5pSpecies;
    requestedRange:{from:string;to:string};observedAt:null;provenance:"copernicus-sentinel-hub";
    caution:string;
  }>{
    const p=S5P_SPECIES[request.species];
    if(!p)throw new RangeError("Unsupported TROPOMI species");
    const width=request.width??512,height=request.height??512;
    boundedImageDimensions(width,height,2048*2048);
    const from=assertUtcDate(request.from),to=assertUtcDate(request.to);
    if(from>=to)throw new RangeError("Invalid Sentinel-5P time interval");
    if(request.minQa!==undefined && (!Number.isFinite(request.minQa)||request.minQa<0||request.minQa>100))
      throw new RangeError("minQa must be within 0..100");
    if(request.timeliness!==undefined&&!["NRTI","OFFL","RPRO"].includes(request.timeliness))
      throw new RangeError("Invalid Sentinel-5P timeliness");
    const frame:ProcessedRaster=await this.copernicus.process({
      area:request.area,from,to, dataType:"sentinel-5p-l2",
      evalscript:s5pVisualScript(request.species),
      width,height,format:"image/png",mosaickingOrder:"mostRecent",
      ...(request.minQa!==undefined?{minQa:request.minQa}:{}),
      ...(request.timeliness?{timeliness:request.timeliness}:{}),
    });
    if(!/image\/png/.test(frame.contentType))throw new Error("Sentinel-5P Process API returned unexpected content type");
    return {bytes:new Uint8Array(frame.data),contentType:frame.contentType,unit:p.unit,
      species:request.species,requestedRange:{from,to},observedAt:null,provenance:"copernicus-sentinel-hub",
      caution:"Colorized image, not calibrated numeric gas raster. TROPOMI measures atmospheric columns, not surface concentrations. Mosaic time cannot be deduced from requested window.",
    };
  }
}
