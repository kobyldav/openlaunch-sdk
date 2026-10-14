import type {BBox,AreaOfInterest} from "../geo/types.js";
import {NasaGibsClient, type GibsLayerId, type GibsTileDescriptor} from "../providers/gibs.js";
import {MeteosatClient, type MeteosatMapOptions, type MeteosatMapDescriptor, type MeteosatWmsLayer} from "../providers/meteosat.js";
import {NasaFirmsClient, type FirmsHotspotReport, type FirmsSource} from "../providers/firms.js";
import {Sentinel5pClient, type S5pRasterRequest} from "../providers/sentinel5p.js";
import {SpaceVideoClient, type SpaceStreamId, type SpaceStreamDescriptor} from "../providers/space-video.js";
import {CopernicusClient, type CopernicusOptions} from "../providers/copernicus.js";
import {PlanetaryComputerClient, type PlanetaryComputerOptions} from "../providers/planetary-computer.js";
import {ObservationDiscoveryClient, type ObservationDiscoveryOptions, type ObservationDiscoveryReport} from "./observations.js";
import type {StacItem} from "../providers/stac.js";
import type {BoundedHttpOptions} from "../providers/eo-bounded.js";

export type MapCategory="observations"|"analyses"|"terrain-history"|"live-video";
export type MapSourceType="stac"|"derived-raster"|"wmts"|"wms"|"csv-points"|"process-api"|"video-embed";
export type MapTemporalMode="archive"|"daily"|"near-real-time"|"static"|"on-demand"|"external-stream";
export type SpaceLayerId =
  |"sentinel2-optical"|"sentinel1-radar"|"landsat-temperature"|"meteosat-weather"
  |"nasa-modis-terra"|"nasa-viirs-snpp"|"vegetation-ndvi"|"water-ndwi"
  |"moisture-ndmi"|"burn-scar-nbr"|"atmosphere-no2"|"atmosphere-so2"
  |"fires-viirs"|"dem-terrain"|"time-comparison"|"archive-scenes"
  |"iss-video"|"meteosat-video";

export interface SpaceLayer{
  id:SpaceLayerId;category:MapCategory;
  label:string;provider:string;mission:string;
  sourceType:MapSourceType;
  temporalMode:MapTemporalMode;
  sdkFunction:string;
  requiresKey:boolean;
  isGeoreferenced:boolean;
  resolutionMetres:null; // populated from actual STAC/product metadata, not guessed.
  observationTime:null; // static registry NEVER pretends to know acquisition timestamp.
  lastCheckedAt:null;
  liveVerified:false;
  caveat:string;
}
const CATALOG:readonly SpaceLayer[]=Object.freeze([
  {id:"sentinel2-optical",category:"observations",label:"Optické snímky",provider:"Copernicus",mission:"Sentinel-2",sourceType:"stac",temporalMode:"archive",sdkFunction:"maps.discoverObservations({layers:['optical']})",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"STAC metadata; actual asset resolution and acquisition time are product-specific."},
  {id:"sentinel1-radar",category:"observations",label:"Radar SAR",provider:"Copernicus",mission:"Sentinel-1",sourceType:"stac",temporalMode:"archive",sdkFunction:"maps.discoverObservations({layers:['radar']})",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Radar intensity differs from optical photography; provider-specific geocoding may be needed."},
  {id:"landsat-temperature",category:"observations",label:"Termální snímky",provider:"USGS/NASA",mission:"Landsat 8/9",sourceType:"stac",temporalMode:"archive",sdkFunction:"maps.discoverObservations({layers:['thermal']})",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Land-surface temperature from calibrated band, not ambient air temperature."},
  {id:"meteosat-weather",category:"observations",label:"Meteosat — oblačnost",provider:"EUMETSAT",mission:"Meteosat",sourceType:"wms",temporalMode:"near-real-time",sdkFunction:"maps.meteosatCapabilities(), maps.meteosatMap()",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Layer IDs must come from live WMS capabilities; server default time is not proof of capture time."},
  {id:"nasa-modis-terra",category:"observations",label:"NASA MODIS — Terra",provider:"NASA GIBS",mission:"Terra MODIS",sourceType:"wmts",temporalMode:"daily",sdkFunction:"maps.nasaDailyTiles('MODIS_Terra_CorrectedReflectance_TrueColor',date)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"NASA imagery mosaic for requested date; tiles may be delayed or missing."},
  {id:"nasa-viirs-snpp",category:"observations",label:"NASA VIIRS — Suomi-NPP",provider:"NASA GIBS",mission:"Suomi NPP",sourceType:"wmts",temporalMode:"daily",sdkFunction:"maps.nasaDailyTiles('VIIRS_SNPP_CorrectedReflectance_TrueColor',date)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Daily imagery, not a live continuously updated camera."},
  {id:"vegetation-ndvi",category:"analyses",label:"Vegetace NDVI",provider:"OpenLaunch Raster",mission:"Sentinel-2/Landsat",sourceType:"derived-raster",temporalMode:"on-demand",sdkFunction:"ndviRaster(red,nir)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Actual calibrated, co-registered band pixels and cloud masks needed."},
  {id:"water-ndwi",category:"analyses",label:"Voda NDWI",provider:"OpenLaunch Raster",mission:"Sentinel-2/Landsat",sourceType:"derived-raster",temporalMode:"on-demand",sdkFunction:"ndwi(green,nir)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Spectral index calculated from physical band data; no universal water classification threshold."},
  {id:"moisture-ndmi",category:"analyses",label:"Vlhkost NDMI",provider:"OpenLaunch Raster",mission:"Sentinel-2/Landsat",sourceType:"derived-raster",temporalMode:"on-demand",sdkFunction:"ndmi(nir,swir1)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Spectral proxy, not soil moisture measured in percent."},
  {id:"burn-scar-nbr",category:"analyses",label:"Požáry — NBR",provider:"OpenLaunch Raster",mission:"Sentinel-2/Landsat",sourceType:"derived-raster",temporalMode:"on-demand",sdkFunction:"nbr(nir,swir2)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Burn severity index needs before/after scenes, cloud QA and interpretation."},
  {id:"atmosphere-no2",category:"analyses",label:"Znečištění NO₂",provider:"Copernicus",mission:"Sentinel-5P TROPOMI",sourceType:"process-api",temporalMode:"near-real-time",sdkFunction:"maps.airQuality({species:'NO2',...})",requiresKey:true,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Atmospheric column mol/m², not ground-level concentration; image is colorized visualization."},
  {id:"atmosphere-so2",category:"analyses",label:"Znečištění SO₂",provider:"Copernicus",mission:"Sentinel-5P TROPOMI",sourceType:"process-api",temporalMode:"near-real-time",sdkFunction:"maps.airQuality({species:'SO2',...})",requiresKey:true,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Atmospheric column; high latency possible depending processing timeliness."},
  {id:"fires-viirs",category:"analyses",label:"Aktivní hotspoty",provider:"NASA FIRMS",mission:"VIIRS/MODIS",sourceType:"csv-points",temporalMode:"near-real-time",sdkFunction:"maps.activeFires(bbox,{source,days})",requiresKey:true,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Detected thermal anomalies are not confirmed fire perimeters; obtain FIRMS MAP_KEY."},
  {id:"dem-terrain",category:"terrain-history",label:"3D terén / DEM",provider:"Copernicus",mission:"Copernicus DEM",sourceType:"stac",temporalMode:"static",sdkFunction:"maps.discoverObservations({layers:['elevation']})",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Static terrain, not a recent orbital pass or complete 3D viewer."},
  {id:"time-comparison",category:"terrain-history",label:"Porovnání v čase",provider:"OpenLaunch Raster",mission:"Multiple acquisition dates",sourceType:"derived-raster",temporalMode:"on-demand",sdkFunction:"rasterDifference(before,after)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Compare co-registered, calibrated and masked scenes with equivalent measurement units."},
  {id:"archive-scenes",category:"terrain-history",label:"Archiv snímků",provider:"Copernicus/Planetary Computer",mission:"Sentinel/Landsat",sourceType:"stac",temporalMode:"archive",sdkFunction:"maps.discoverObservations(options)",requiresKey:false,isGeoreferenced:true,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"STAC catalog is not proof that a scene has downloadable assets for your AOI."},
  {id:"iss-video",category:"live-video",label:"ISS LIVE kamera",provider:"NASA",mission:"ISS",sourceType:"video-embed",temporalMode:"external-stream",sdkFunction:"maps.videoStream('iss-earth-live')",requiresKey:false,isGeoreferenced:false,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"External third-party embedded video; not map pixels, camera may show recorded footage."},
  {id:"meteosat-video",category:"live-video",label:"Meteosat LIVE video",provider:"EUMETSAT",mission:"Meteosat-12",sourceType:"video-embed",temporalMode:"external-stream",sdkFunction:"maps.videoStream('meteosat-europe-live')",requiresKey:false,isGeoreferenced:false,resolutionMetres:null,observationTime:null,lastCheckedAt:null,liveVerified:false,caveat:"Near-real-time YouTube animation, not a zero-latency continuous video camera."},
]);
export interface SpaceMapOptions {
  fetch?:typeof fetch;
  copernicus?:CopernicusOptions;
  planetaryComputer?:PlanetaryComputerOptions;
  firmsMapKey?:string;
  copernicusClient?:CopernicusClient;
  planetaryComputerClient?:PlanetaryComputerClient;
}
export interface SceneFreshness {
  observationTime:string|null;
  checkedAt:string;
  ageMinutes:number|null;
  freshness:"recent"|"stale"|"unknown";
  sourceItemId:string;
  sourceCollection:string|null;
  liveVerified:false;
}
/** Shared UI catalog and actual provider adapters, no web-specific components. */
export class SpaceMapClient{
  readonly gibs:NasaGibsClient;
  readonly meteosat:MeteosatClient;
  readonly s5p:Sentinel5pClient;
  readonly videos:SpaceVideoClient;
  readonly observations:ObservationDiscoveryClient;
  private readonly firms:NasaFirmsClient|null;
  constructor(options:SpaceMapOptions={}){
    const http:BoundedHttpOptions=options.fetch?{fetch:options.fetch}:{};
    const copernicus=options.copernicusClient??new CopernicusClient({...options.copernicus,...(options.fetch?{fetch:options.fetch}:{})});
    const pc=options.planetaryComputerClient??new PlanetaryComputerClient({...options.planetaryComputer,...(options.fetch?{fetch:options.fetch}:{})});
    this.observations=new ObservationDiscoveryClient(copernicus,pc);
    this.gibs=new NasaGibsClient(http);
    this.meteosat=new MeteosatClient(http);
    this.s5p=new Sentinel5pClient(copernicus);
    this.videos=new SpaceVideoClient();
    this.firms=options.firmsMapKey?new NasaFirmsClient(options.firmsMapKey,http):null;
  }
  layers(category?:MapCategory):SpaceLayer[]{
    return CATALOG.filter(x=>!category||x.category===category).map(x=>({...x}));
  }
  layer(id:SpaceLayerId):SpaceLayer{
    const item=CATALOG.find(x=>x.id===id);
    if(!item)throw new RangeError("Unknown space map layer");
    return {...item};
  }
  videoStream(id:SpaceStreamId):SpaceStreamDescriptor{return this.videos.get(id);}
  nasaDailyTiles(layer:GibsLayerId,date:Date|string):GibsTileDescriptor{return this.gibs.tileTemplate(layer,date);}
  meteosatCapabilities():Promise<{layers:MeteosatWmsLayer[];fetchedAt:string;endpoint:string}>{return this.meteosat.capabilities();}
  meteosatMap(options:MeteosatMapOptions):MeteosatMapDescriptor{return this.meteosat.mapUrl(options);}
  discoverObservations(options:ObservationDiscoveryOptions):Promise<ObservationDiscoveryReport>{
    return this.observations.discover(options);
  }
  activeFires(bounds:BBox,options:{source?:FirmsSource;days?:number;date?:string;maxRows?:number}={}):Promise<FirmsHotspotReport>{
    if(!this.firms)throw new Error("NASA FIRMS requires server-side MAP_KEY (SpaceMapOptions.firmsMapKey)");
    return this.firms.hotspots(bounds,options);
  }
  airQuality(request:S5pRasterRequest):ReturnType<Sentinel5pClient["render"]>{return this.s5p.render(request);}
  /** STAC acquisition timestamp only. This never indicates live stream uptime. */
  sceneFreshness(item:StacItem,now:Date=new Date(),recentWithinMinutes=360):SceneFreshness{
    const time=item.properties.datetime??item.properties.start_datetime;
    const parsed=typeof time==="string"?new Date(time):new Date(NaN);
    const age=Number.isFinite(parsed.getTime())&&Number.isFinite(now.getTime())?
      (now.getTime()-parsed.getTime())/60_000:null;
    const trustworthy=age!==null&&age>=0;
    if(!Number.isFinite(recentWithinMinutes)||recentWithinMinutes<=0)throw new RangeError("Invalid recentWithinMinutes");
    return {observationTime:trustworthy?parsed.toISOString():null,
      checkedAt:now.toISOString(),ageMinutes:trustworthy?age:null,
      freshness:trustworthy?(age<=recentWithinMinutes?"recent":"stale"):"unknown",
      sourceItemId:item.id,sourceCollection:item.collection??null,liveVerified:false};
  }
}
