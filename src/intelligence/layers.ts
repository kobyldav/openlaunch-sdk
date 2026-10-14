import type { AreaOfInterest } from "../geo/types.js";
import type { StacItem, StacFeatureCollection } from "../providers/stac.js";
import { PlanetaryComputerClient } from "../providers/planetary-computer.js";

export type EarthLayerKind="optical"|"radar"|"thermal"|"elevation"|"vegetation"|"water"|"moisture"|"burn-severity"|"clouds"|"atmosphere"|"fire-hotspots"|"live-video";
export type Freshness="archive"|"latest-available"|"near-real-time"|"live-stream";
export interface EarthLayerDescriptor {
 id:string;label:string;category:"observations"|"analyses"|"terrain-history"|"live";
 kind:EarthLayerKind;source:string;method:"stac"|"wmts"|"firms-csv"|"provider-process"|"derived-raster"|"external-video";
 freshness:Freshness;requiresAuth:boolean;enabledByDefault:boolean;implemented:boolean;
 acquisitionTime:string|null;lastUpdated:string|null;spatialResolutionM:number|null;cadenceMinutes:number|null;
 limitations:readonly string[];provenanceUrl:string;
}
export interface LayerFrame {
 layerId:string;timestamp:string;tileTemplate:string;provider:string;
 freshness:"latest-available"|"near-real-time";
 /** Explicitly unknown unless confirmed with a provider capabilities result. */
 actualAcquisitionVerified:false;
}
export interface LiveVideoSource {
 id:string;label:string;provider:string;landingPage:string;
 playbackType:"external-page";isLiveVerified:false;georeferenced:false;
 warnings:readonly string[];
}
const doc="https://nasa-gibs.github.io/gibs-api-docs/access-basics/";
const NASA_WMTS="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const layerDefs:readonly EarthLayerDescriptor[]=[
 {id:"sentinel-2-optical",label:"Optické snímky Sentinel-2",category:"observations",kind:"optical",source:"Copernicus Sentinel-2 L2A",method:"stac",freshness:"latest-available",requiresAuth:false,enabledByDefault:true,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Resolution and time come from the returned STAC item; cloud-free pixels are not guaranteed."],provenanceUrl:"https://dataspace.copernicus.eu/"},
 {id:"sentinel-1-radar",label:"Radar Sentinel-1",category:"observations",kind:"radar",source:"Copernicus Sentinel-1 GRD",method:"stac",freshness:"latest-available",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["SAR backscatter is not a normal RGB photograph."],provenanceUrl:"https://dataspace.copernicus.eu/"},
 {id:"landsat-thermal",label:"Povrchová teplota Landsat",category:"observations",kind:"thermal",source:"Landsat Collection 2 Level-2",method:"stac",freshness:"latest-available",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Only scenes with an actual L2 ST asset; land surface temperature is not air temperature."],provenanceUrl:"https://planetarycomputer.microsoft.com/"},
 {id:"nasa-modis-terra",label:"MODIS Terra – reálná barevná kompozice",category:"observations",kind:"optical",source:"NASA GIBS / MODIS Terra",method:"wmts",freshness:"latest-available",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["A requested date is not proof of available imagery or acquisition within the AOI."],provenanceUrl:doc},
 {id:"nasa-viirs-snpp",label:"VIIRS Suomi-NPP – reálná barevná kompozice",category:"observations",kind:"optical",source:"NASA GIBS / VIIRS S-NPP",method:"wmts",freshness:"latest-available",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Layer/time availability must be checked against NASA GIBS capabilities."],provenanceUrl:doc},
 {id:"meteosat-clouds",label:"Meteosat – živá oblačnost",category:"live",kind:"clouds",source:"EUMETSAT",method:"provider-process",freshness:"near-real-time",requiresAuth:true,enabledByDefault:false,implemented:false,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Provider product selection, rights, credentials and actual frame availability not integrated. Not live video."],provenanceUrl:"https://data.eumetsat.int/"},
 {id:"sentinel-5p-no2",label:"Sentinel-5P – NO₂",category:"analyses",kind:"atmosphere",source:"Copernicus Sentinel-5P TROPOMI",method:"stac",freshness:"latest-available",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Generic STAC discovery only; specialized NO2 unit conversion and raster visualization are not implemented."],provenanceUrl:"https://dataspace.copernicus.eu/"},
 {id:"active-fires",label:"Aktivní požáry NASA FIRMS",category:"analyses",kind:"fire-hotspots",source:"NASA FIRMS VIIRS/MODIS",method:"firms-csv",freshness:"near-real-time",requiresAuth:true,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Requires FIRMS MAP_KEY. Hotspots are detections, not verified fire boundaries."],provenanceUrl:"https://firms.modaps.eosdis.nasa.gov/api/area/"},
 {id:"vegetation-ndvi",label:"Vegetace (NDVI)",category:"analyses",kind:"vegetation",source:"Derived from calibrated optical raster",method:"derived-raster",freshness:"archive",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Requires actual aligned red/NIR data with radiometric calibration and quality mask."],provenanceUrl:"https://github.com/kobyldav/openlaunch-sdk/blob/main/docs/RASTER_V1.md"},
 {id:"water-ndwi",label:"Voda (NDWI)",category:"analyses",kind:"water",source:"Derived from optical raster",method:"derived-raster",freshness:"archive",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Requires calibrated green/NIR reflectance and cloud mask."],provenanceUrl:"https://github.com/kobyldav/openlaunch-sdk"},
 {id:"moisture-ndmi",label:"Vlhkost (NDMI)",category:"analyses",kind:"moisture",source:"Derived from optical raster",method:"derived-raster",freshness:"archive",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Requires NIR/SWIR reflectance in matched grids."],provenanceUrl:"https://github.com/kobyldav/openlaunch-sdk"},
 {id:"terrain-dem",label:"3D terén a DEM",category:"terrain-history",kind:"elevation",source:"Copernicus DEM GLO-30",method:"stac",freshness:"archive",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Local mesh not geodetic 3D tiles or a real-time elevation measurement."],provenanceUrl:"https://planetarycomputer.microsoft.com/"},
 {id:"historical-compare",label:"Porovnání snímků v čase",category:"terrain-history",kind:"vegetation",source:"Two actual calibrated/registered scenes",method:"derived-raster",freshness:"archive",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["Requires two real scenes; nodata and masks must be respected."],provenanceUrl:"https://github.com/kobyldav/openlaunch-sdk"},
 {id:"iss-live-camera",label:"ISS živé video",category:"live",kind:"live-video",source:"NASA ISS station views",method:"external-video",freshness:"live-stream",requiresAuth:false,enabledByDefault:false,implemented:true,acquisitionTime:null,lastUpdated:null,spatialResolutionM:null,cadenceMinutes:null,limitations:["NASA availability changes. No guaranteed playable direct stream, embed permission or coverage over Czechia."],provenanceUrl:"https://www.nasa.gov/live/"},
];
/** Static supported/unsupported feature inventory for frontend switches. No fabricated acquisition timestamps. */
export function earthLayerCatalog():EarthLayerDescriptor[]{return layerDefs.map(x=>({...x,limitations:[...x.limitations]}));}
export function nasaGibsTileTemplate(layer:"nasa-modis-terra"|"nasa-viirs-snpp",date:string):LayerFrame {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)throw new RangeError("GIBS date must be a real YYYY-MM-DD date");
 const id=layer==="nasa-modis-terra"?"MODIS_Terra_CorrectedReflectance_TrueColor":"VIIRS_SNPP_CorrectedReflectance_TrueColor";
 // NASA GIBS Web Mercator REST uses GoogleMapsCompatible_Level9 matrix set.
 return {layerId:layer,timestamp:date,tileTemplate:`${NASA_WMTS}/${id}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
 provider:"NASA GIBS",freshness:"latest-available",actualAcquisitionVerified:false};
}
export function nasaGibsCapabilitiesUrl():string {return NASA_WMTS+"/1.0.0/WMTSCapabilities.xml";}
export function issLiveSource():LiveVideoSource{return {id:"iss-live-camera",label:"ISS – NASA Live",provider:"NASA",landingPage:"https://www.nasa.gov/live/",playbackType:"external-page",isLiveVerified:false,georeferenced:false,warnings:["NASA controls current stream availability and player embedding. This is not a geolocated live map tile or an ISS view over a selected AOI."]};}
export interface FireHotspot {
 latitude:number;longitude:number;acquiredAt:string;source:string;confidence:string|null;frpMw:number|null;
}
const SOURCES=["MODIS_NRT","VIIRS_NOAA20_NRT","VIIRS_NOAA21_NRT","VIIRS_SNPP_NRT"] as const;
export type FirmsSource=typeof SOURCES[number];
export function parseFirmsCsv(csv:string,source:string,maxFeatures=10000):FireHotspot[]{
 if(!Number.isSafeInteger(maxFeatures)||maxFeatures<1||maxFeatures>50000)throw new RangeError("Invalid maxFeatures");
 const lines=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
 if(lines.length===0||!lines[0])return [];
 const parse=(line:string)=>{const cols:string[]=[];let word="",quoted=false;for(let i=0;i<line.length;i++){const ch=line[i]!;if(ch==='"'){if(quoted&&line[i+1]==='"'){word+='"';i++;}else quoted=!quoted;}else if(ch===","&&!quoted){cols.push(word);word="";}else word+=ch;}if(quoted)throw new RangeError("Malformed quoted FIRMS CSV");cols.push(word);return cols;};
 const hdr=parse(lines[0]!).map(x=>x.trim().toLowerCase());
 for(const required of ["latitude","longitude","acq_date","acq_time"])if(!hdr.includes(required))throw new RangeError("FIRMS missing column "+required);
 const idx=(k:string)=>hdr.indexOf(k);
 const out:FireHotspot[]=[];
 for(const line of lines.slice(1)){if(!line.trim())continue;if(out.length>=maxFeatures)throw new RangeError("FIRMS hotspot limit exceeded");
 const row=parse(line),lat=Number(row[idx("latitude")]),lon=Number(row[idx("longitude")]);
 if(!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lon)||lon < -180||lon>180)continue;
 const day=row[idx("acq_date")]??"",t=(row[idx("acq_time")]??"").padStart(4,"0");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{4}$/.test(t))continue;
 const when=new Date(`${day}T${t.slice(0,2)}:${t.slice(2)}:00Z`);
 if(!Number.isFinite(when.getTime()))continue;
 const frp=idx("frp")>=0?Number(row[idx("frp")]):NaN;
 out.push({latitude:lat,longitude:lon,acquiredAt:when.toISOString(),source,confidence:idx("confidence")>=0?row[idx("confidence")]??null:null,frpMw:Number.isFinite(frp)?frp:null});
 }
 return out;
}
export interface FirmsQueryOptions {
 mapKey:string; area:AreaOfInterest;source?:FirmsSource;days?:number;fetch?:typeof fetch;
 maxResponseBytes?:number;timeoutMs?:number;
}
/** Backend-only API: caller must keep NASA MAP_KEY private and enforce quotas. */
export async function fetchFirmsHotspots(opts:FirmsQueryOptions):Promise<FireHotspot[]>{
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(opts.mapKey))throw new RangeError("Invalid FIRMS MAP_KEY");
 const source=opts.source??"VIIRS_NOAA21_NRT",days=opts.days??1;
 if(!SOURCES.includes(source)||!Number.isInteger(days)||days<1||days>5)throw new RangeError("Invalid FIRMS source/day range");
 const [w,s,e,n]=opts.area.bbox;if(w>e)throw new RangeError("Antimeridian bboxes not supported");
 const coords=[w,s,e,n].join(",");
 const url=`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(opts.mapKey)}/${source}/${coords}/${days}`;
 const limit=opts.maxResponseBytes??2*1024*1024;
 if(!Number.isSafeInteger(limit)||limit<1||limit>8*1024*1024)throw new RangeError("Invalid maxResponseBytes");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),opts.timeoutMs??20000);
 try{
 const response=await (opts.fetch??fetch)(url,{method:"GET",signal:controller.signal,redirect:"error",headers:{Accept:"text/csv"}});
 if(!response.ok)throw new Error("FIRMS API failed with HTTP "+response.status);
 const reader=response.body?.getReader();if(!reader)throw new Error("Empty FIRMS response");
 let len=0;const chunks:Uint8Array[]=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;len+=value.length;if(len>limit){await reader.cancel();throw new RangeError("FIRMS byte limit exceeded");}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(len);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}
 return parseFirmsCsv(new TextDecoder().decode(bytes),source);
 }finally{clearTimeout(timer);}
}
/** Explicit, provider-chosen STAC collection; no promise of product availability or decode support. */
export async function discoverAtmosphereScenes(
 collection:string,area:AreaOfInterest,from:Date,to:Date,client:PlanetaryComputerClient,
):Promise<StacFeatureCollection>{
 if(!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(collection))throw new RangeError("Invalid STAC collection");
 if(!(from instanceof Date&&to instanceof Date&&Number.isFinite(+from)&&Number.isFinite(+to)&&from<=to))throw new RangeError("Invalid time range");
 return client.stac.search({collections:[collection],intersects:area.geometry,datetime:{from,to},limit:30});
}
