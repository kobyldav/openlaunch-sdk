import type { BBox } from "../geo/types.js";
import { boundedProviderGet, type BoundedHttpOptions } from "./eo-bounded.js";

export type FirmsSource =
  | "VIIRS_SNPP_NRT" | "VIIRS_NOAA20_NRT" | "VIIRS_NOAA21_NRT" | "MODIS_NRT";
export interface FirmsHotspot{
  id:string; latitude:number; longitude:number;
  acquiredAt:string;
  satellite:string;instrument:string;
  confidence:string|null;
  dayNight:"D"|"N"|null;
  brightnessKelvin:number|null;
  frpMegawatts:number|null;
  detectionOnly:true;
}
export interface FirmsHotspotReport{
  provider:"nasa-firms";
  source:FirmsSource;
  fromDate:string|null;
  queriedAt:string;
  observations:FirmsHotspot[];
  returned:number;
  ignoredMalformed:number;
  freshness:"near-real-time"|"historical";
  caveats:readonly string[];
}
const ENDPOINT="https://firms.modaps.eosdis.nasa.gov/api/area/csv";
/** User supplies FIRMS MAP_KEY server-side. Do not send it to a public browser. */
export class NasaFirmsClient{
  private readonly key:string;
  constructor(mapKey:string,private readonly options:BoundedHttpOptions={}){
    if(!/^[a-zA-Z0-9_-]{8,128}$/.test(mapKey))throw new RangeError("A valid NASA FIRMS MAP_KEY is required");
    this.key=mapKey;
  }
  async hotspots(bounds:BBox,options:{source?:FirmsSource;days?:number;date?:string;maxRows?:number}={}):Promise<FirmsHotspotReport>{
    if(bounds.length!==4||bounds.some(v=>!Number.isFinite(v))||
      bounds[0]! < -180||bounds[2]!>180||bounds[1]! < -90||bounds[3]!>90||
      bounds[0]!>=bounds[2]!||bounds[1]!>=bounds[3]!)
      throw new RangeError("Invalid FIRMS longitude/latitude bounding box");
    const source=options.source??"VIIRS_SNPP_NRT";
    const sources:readonly string[]=["VIIRS_SNPP_NRT","VIIRS_NOAA20_NRT","VIIRS_NOAA21_NRT","MODIS_NRT"];
    if(!sources.includes(source))throw new RangeError("Unknown FIRMS instrument source");
    const days=options.days??1;
    if(!Number.isInteger(days)||days<1||days>5)throw new RangeError("FIRMS days must be between 1 and 5");
    const maxRows=options.maxRows??20_000;
    if(!Number.isInteger(maxRows)||maxRows<1||maxRows>100_000)throw new RangeError("Invalid FIRMS maxRows");
    if(options.date!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(options.date))throw new RangeError("FIRMS date must use YYYY-MM-DD");
    const url=`${ENDPOINT}/${encodeURIComponent(this.key)}/${source}/${bounds.join(",")}/${days}${options.date?"/"+options.date:""}`;
    const result=await boundedProviderGet(url,{...this.options,maxBytes:this.options.maxBytes??8*1024*1024});
    const csv=new TextDecoder().decode(result.bytes);
    if(/<html|<!doctype/i.test(csv.slice(0,200)))throw new Error("FIRMS returned HTML instead of CSV");
    const parsed=parseFirmsCsv(csv,{bounds,maxRows});
    return {
      provider:"nasa-firms",source,queriedAt:new Date().toISOString(),
      fromDate:options.date??null,observations:parsed.items,
      returned:parsed.items.length,ignoredMalformed:parsed.ignored,
      freshness:options.date?"historical":"near-real-time",
      caveats:[
        "A thermal hotspot is a satellite detection, not a verified active wildfire polygon.",
        "NRT detections may be delayed after satellite overpass and can have false positives.",
        "FIRMS data are subject to provider attribution, MAP_KEY and redistribution rules.",
      ],
    };
  }
}
/** RFC4180-style quoted comma/newline CSV parser with bounded input size. */
export function parseFirmsCsv(csv:string,options:{bounds?:BBox;maxRows?:number}={}):{items:FirmsHotspot[];ignored:number}{
  if(csv.length>16_000_000)throw new RangeError("FIRMS CSV exceeds text size limit");
  const rows:string[][]=[];let row:string[]=[],value="",quoted=false;
  for(let i=0;i<csv.length;i++){
    const c=csv[i]!;
    if(c==='"'){
      if(quoted&&csv[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
    }else if(c===","&&!quoted){row.push(value);value="";}
    else if((c==="\n"||c==="\r")&&!quoted){
      if(c==="\r"&&csv[i+1]==="\n")i++;
      row.push(value);value="";
      if(row.some(v=>v.trim()!==""))rows.push(row);
      row=[];
    }else value+=c;
  }
  if(quoted)throw new RangeError("Unterminated FIRMS CSV quote");
  row.push(value);if(row.some(v=>v.trim()!==""))rows.push(row);
  if(rows.length===0)return {items:[],ignored:0};
  const fields=rows[0]!.map(x=>x.replace(/^\uFEFF/,"").trim().toLowerCase());
  for(const name of ["latitude","longitude","acq_date","acq_time"]){
    if(!fields.includes(name))throw new Error("FIRMS CSV missing required column "+name);
  }
  const maxRows=options.maxRows??20_000;
  if(rows.length-1>maxRows)throw new RangeError("FIRMS response exceeds maxRows");
  const items:FirmsHotspot[]=[];let ignored=0;
  for(let rowIndex=1;rowIndex<rows.length;rowIndex++){
    const r=rows[rowIndex]!;
    const get=(key:string):string=>(r[fields.indexOf(key)]??"").trim();
    const latitude=Number(get("latitude")),longitude=Number(get("longitude"));
    const date=get("acq_date"),time=get("acq_time").padStart(4,"0");
    const hour=Number(time.slice(0,2)),minute=Number(time.slice(2));
    const ts=/^\d{4}-\d{2}-\d{2}$/.test(date) &&/^\d{4}$/.test(time)&&hour<24&&minute<60?
      new Date(date+"T"+time.slice(0,2)+":"+time.slice(2)+":00Z"):new Date(NaN);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||
      !Number.isFinite(ts.getTime())||ts.toISOString().slice(0,10)!==date){ignored++;continue;}
    const b=options.bounds;
    if(b && (longitude<b[0]!||longitude>b[2]!||latitude<b[1]!||latitude>b[3]!))continue;
    const numeric=(s:string):number|null=>s!==""&&Number.isFinite(Number(s))?Number(s):null;
    const dn=get("daynight").toUpperCase();
    items.push({
      id:`${date}T${time}-${rowIndex}`,latitude,longitude,acquiredAt:ts.toISOString(),
      satellite:get("satellite")||"unknown",instrument:get("instrument")||"unknown",
      confidence:get("confidence")||null,dayNight:dn==="D"||dn==="N"?dn:null,
      brightnessKelvin:numeric(get("bright_ti4")||get("brightness")),
      frpMegawatts:numeric(get("frp")),
      detectionOnly:true,
    });
  }
  return {items,ignored};
}
