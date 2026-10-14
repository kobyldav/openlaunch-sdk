import { assertUtcDay, boundedProviderGet, type BoundedHttpOptions } from "./eo-bounded.js";

export const NASA_GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export type GibsLayerId =
  | "MODIS_Terra_CorrectedReflectance_TrueColor"
  | "MODIS_Aqua_CorrectedReflectance_TrueColor"
  | "VIIRS_SNPP_CorrectedReflectance_TrueColor"
  | "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
export interface GibsPreset {
  id:GibsLayerId;
  title:string;
  mission:string;
  matrixSet:"GoogleMapsCompatible_Level9";
  maxZoom:9;
  format:"jpg";
  temporalResolution:"daily";
}
export const GIBS_PRESETS:readonly GibsPreset[]=Object.freeze([
  {id:"MODIS_Terra_CorrectedReflectance_TrueColor",title:"Terra MODIS true color",mission:"Terra",matrixSet:"GoogleMapsCompatible_Level9",maxZoom:9,format:"jpg",temporalResolution:"daily"},
  {id:"MODIS_Aqua_CorrectedReflectance_TrueColor",title:"Aqua MODIS true color",mission:"Aqua",matrixSet:"GoogleMapsCompatible_Level9",maxZoom:9,format:"jpg",temporalResolution:"daily"},
  {id:"VIIRS_SNPP_CorrectedReflectance_TrueColor",title:"Suomi-NPP VIIRS true color",mission:"Suomi-NPP",matrixSet:"GoogleMapsCompatible_Level9",maxZoom:9,format:"jpg",temporalResolution:"daily"},
  {id:"VIIRS_NOAA20_CorrectedReflectance_TrueColor",title:"NOAA-20 VIIRS true color",mission:"NOAA-20",matrixSet:"GoogleMapsCompatible_Level9",maxZoom:9,format:"jpg",temporalResolution:"daily"},
]);
export interface GibsTileDescriptor {
  provider:"nasa-gibs";
  kind:"wmts-xyz";
  urlTemplate:string;
  layer:GibsLayerId;
  requestedDate:string;
  observedAt:null;
  verifiedAvailable:false;
  maxZoom:number;
  attribution:string;
  note:string;
}
/** MapLibre/Leaflet-compatible XYZ URL template; does not claim that a date's tiles exist. */
export function nasaGibsTileTemplate(layer:GibsLayerId, date:Date|string):GibsTileDescriptor{
  const preset=GIBS_PRESETS.find(p=>p.id===layer);
  if(!preset)throw new RangeError("Unknown or unsupported NASA GIBS layer");
  const day=assertUtcDay(date);
  return {
    provider:"nasa-gibs",kind:"wmts-xyz",
    urlTemplate:`${NASA_GIBS_BASE}/${layer}/default/${day}/${preset.matrixSet}/{z}/{y}/{x}.${preset.format}`,
    layer,requestedDate:day,observedAt:null,verifiedAvailable:false,
    maxZoom:preset.maxZoom,attribution:"NASA EOSDIS GIBS",
    note:"Requested daily layer, not a verified observation timestamp; tile may be unavailable or still processing.",
  };
}
export class NasaGibsClient{
  constructor(private readonly options:BoundedHttpOptions={}){}
  tileTemplate(layer:GibsLayerId,date:Date|string):GibsTileDescriptor{return nasaGibsTileTemplate(layer,date);}
  /** Request one real image and refuse error XML/HTML masquerading as a tile. */
  async fetchTile(layer:GibsLayerId,date:Date|string,z:number,x:number,y:number):Promise<{image:Uint8Array;contentType:string;url:string;requestedDate:string}>{
    const descriptor=this.tileTemplate(layer,date);
    if(!Number.isInteger(z)||z<0||z>descriptor.maxZoom||!Number.isInteger(x)||!Number.isInteger(y)||
      x<0||y<0||x>=2**z||y>=2**z)throw new RangeError("Invalid GIBS XYZ tile coordinates");
    const url=descriptor.urlTemplate.replace("{z}",String(z)).replace("{x}",String(x)).replace("{y}",String(y));
    const image=await boundedProviderGet(url,{...this.options,maxBytes:this.options.maxBytes??2*1024*1024});
    if(!/image\/(jpeg|jpg|png)/i.test(image.contentType))throw new Error("GIBS did not return a supported image Content-Type");
    return {image:image.bytes,contentType:image.contentType,url,requestedDate:descriptor.requestedDate};
  }
}
