import {areaKm2Approx,bbox,type AreaOfInterest} from "../geo/types.js";
import {fetchSentinel2RgbTile,type Sentinel2RgbTile} from "../eo/sentinel2-rgb.js";
import {readCogWindowUrl,type CogReadResult,type CogReadOptions} from "../eo/cog.js";
import {fetchCuzkDmpOkRaster,CUZK_DMPOK_SERVICE,CUZK_DMPOK_DATUM,CUZK_DMPOK_NATIVE_RESOLUTION_M} from "./cuzk-dmpok.js";
import {
  elevationToLocalMesh,lonLatToGridCrs,reprojectRasterTo,rasterStatistics,
  type RasterGrid,type TerrainMesh
} from "../eo/raster.js";

/** Public AWS Open Data mirror; no account, SAS signature or API key required. */
export const COPERNICUS_GLO30_HOST="copernicus-dem-30m.s3.eu-central-1.amazonaws.com";
const BASE="https://"+COPERNICUS_GLO30_HOST;
const DEFAULT_START="2025-06-01";
const DEFAULT_END="2025-09-30";

export interface RealTerrainLoadOptions {
  /** Small rectangular geographic AOI (<= 9 km2; no antimeridian/polar regions). */
  area:AreaOfInterest;
  startDate?:string;
  endDate?:string;
  maxCloudPercent?:number;
  /** Output mesh sample spacing, ground metres (20..60). Smaller is NOT higher source resolution. */
  resolutionM?:number;
  /** Height source: 30m global Copernicus (default), or 0.5m-native Czech DMP OK. */
  elevationProvider?:"copernicus-glo30"|"cuzk-dmpok";
  /** Controlled test hook for the already sampled ČÚZK height raster. */
  cuzkReader?:typeof fetchCuzkDmpOkRaster;
  /** Test-only transport hooks; default is real Sentinel-2 and public Copernicus DEM. */
  rgbLoader?:typeof fetchSentinel2RgbTile;
  demReader?:typeof readCogWindowUrl;
}

export interface RealTerrainMap {
  kind:"satellite-rgb-on-copernicus-dsm"|"satellite-rgb-on-cuzk-dmpok";
  /** WGS84 / Pseudo-Mercator sampling grid; heights in Copernicus GLO-30 EGM2008 metres. */
  elevation:RasterGrid;
  /** Local metres: x=east, y=north, z=EGM2008 elevation; no vertical exaggeration. */
  mesh:TerrainMesh;
  /** Native RGB bands, contrast-stretched and sampled at each mesh vertex (3 bytes/vertex). */
  vertexRgb:Uint8Array;
  /** 1 when an actual Sentinel-2 RGB observation contributes to the vertex. */
  rgbValid:Uint8Array;
  /** Independently sampled real Sentinel-2 RGB texture at native ground spacing. RGBA, north row first. */
  imageryTexture:{width:number;height:number;rgba:Uint8Array;validPixels:number;groundResolutionM:number};
  metadata:{
    area:AreaOfInterest["bbox"]; centerLatitudeDeg:number; groundResolutionM:number;
    sceneId:string; acquiredAt:string; sceneCloudPercent:number|null;
    imagerySource:string; imageryNativeResolutionM:number|null;
    demSource:"Copernicus DEM GLO-30 public AWS COG"|"ČÚZK DMP OK ArcGIS ImageServer";
    demTileUrls:string[]; verticalDatum:"EGM2008 geoid"|"Bpv (Baltic 1957)";
    elevationProvider:"copernicus-glo30"|"cuzk-dmpok"; demNativeResolutionM:number;
    demServiceUrl?:string; demAttribution?:string; demLicenseUrl?:string;
    sampledHeights:number; totalHeights:number; sampledColors:number;
    textureGroundResolutionM:number; textureValidPixels:number;
    heightMinM:number; heightMaxM:number;
    warnings:string[];
  };
}

/** Deterministic 1 x 1 degree public COP-DEM GLO-30 COG URL. */
export function copernicusGlo30TileUrl(latDegree:number,lonDegree:number):string {
  if(!Number.isInteger(latDegree)||!Number.isInteger(lonDegree)||
    latDegree< -85||latDegree>84||lonDegree< -180||lonDegree>179)
    throw new RangeError("Invalid Copernicus DEM one-degree tile");
  const ns=latDegree>=0?"N":"S",ew=lonDegree>=0?"E":"W";
  const label="Copernicus_DSM_COG_10_"+ns+String(Math.abs(latDegree)).padStart(2,"0")+
    "_00_"+ew+String(Math.abs(lonDegree)).padStart(3,"0")+"_00_DEM";
  return BASE+"/"+label+"/"+label+".tif";
}

function outputGrid(area:AreaOfInterest,resolutionM:number,maxPixels=50_000):RasterGrid {
  const [w,s,e,n]=area.bbox;
  const lat=(s+n)/2,scale=Math.cos(lat*Math.PI/180);
  const [left,bottom]=lonLatToGridCrs(w,s,"EPSG:3857");
  const [right,top]=lonLatToGridCrs(e,n,"EPSG:3857");
  // Web Mercator is locally enlarged by sec(latitude); compensate in mesh positions.
  const step=resolutionM/scale;
  const width=Math.max(2,Math.ceil((right-left)/step));
  const height=Math.max(2,Math.ceil((top-bottom)/step));
  if(width*height>maxPixels||width>1024||height>1024)
    throw new RangeError("Requested raster grid exceeds safe pixel budget");
  return {width,height,crs:"EPSG:3857",
    transform:[left,(right-left)/width,0,top,0,-(top-bottom)/height],
    values:new Float64Array(width*height).fill(NaN),unit:"m EGM2008"};
}
function contrastRange(band:RasterGrid):readonly [number,number] {
  const sorted=Array.from(band.values).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
  if(!sorted.length)throw new Error("Sentinel-2 band has no valid RGB samples");
  const low=sorted[Math.floor((sorted.length-1)*0.01)]!;
  return [low,Math.max(low+1,sorted[Math.floor((sorted.length-1)*0.99)]!)] as const;
}

/** Load an actual RGB observation and an independent public DSM, then build a
 * local 3D terrain mesh. This is DEM-based 2.5D, NOT stereo reconstruction.
 * No synthetic DEM, invented buildings or fallback imagery.
 */
export async function loadRealTerrain(o:RealTerrainLoadOptions):Promise<RealTerrainMap> {
  const area=o?.area;
  if(!area||area.geometry.type!=="Polygon"||area.bbox.length!==4||
    !area.bbox.every(Number.isFinite))throw new RangeError("Real 3D requires a rectangular bbox AOI");
  const [w,s,e,n]=area.bbox;
  if(w>=e||s>=n||w< -180||e>180||s< -85||n>85||
     areaKm2Approx(area)>9||areaKm2Approx(area)<0.0001)
    throw new RangeError("Real 3D bbox must be within 0.0001..9 km2, WGS84 and below 85 degrees latitude");
  const expected=bbox(w,s,e,n);
  if(JSON.stringify(area.geometry.coordinates)!==JSON.stringify(expected.geometry.coordinates))
    throw new RangeError("Real 3D currently requires bbox() geometry (no masked polygons)");
  const elevationProvider=o.elevationProvider??"copernicus-glo30";
  if(!["copernicus-glo30","cuzk-dmpok"].includes(elevationProvider))
    throw new RangeError("Unknown elevationProvider");
  const resolutionM=o.resolutionM??(elevationProvider==="cuzk-dmpok"?2:30);
  const minimum=elevationProvider==="cuzk-dmpok"?.5:20;
  if(!Number.isFinite(resolutionM)||resolutionM<minimum||resolutionM>60)
    throw new RangeError("resolutionM must be "+minimum+"..60 ground metres for "+elevationProvider);
  const grid=outputGrid(area,resolutionM);
  const rgbPromise=(o.rgbLoader??fetchSentinel2RgbTile)({
    area,startDate:o.startDate??DEFAULT_START,endDate:o.endDate??DEFAULT_END,
    maxCloudPercent:o.maxCloudPercent??35
  });
  const options:CogReadOptions={allowedHosts:[COPERNICUS_GLO30_HOST],
    maxPixels:100_000,maxBlocks:64,maxBlockBytes:16*1024*1024,timeoutMs:90_000};
  const tiles:{url:string;window:AreaOfInterest}[]=[];
  if(elevationProvider==="copernicus-glo30") {
    for(let lat=Math.floor(s);lat<Math.ceil(n);lat++)
      for(let lon=Math.floor(w);lon<Math.ceil(e);lon++){
        const west=Math.max(w,lon),east=Math.min(e,lon+1);
        const south=Math.max(s,lat),north=Math.min(n,lat+1);
        if(west>=east||south>=north)continue;
        tiles.push({url:copernicusGlo30TileUrl(lat,lon),window:bbox(west,south,east,north)});
      }
    if(!tiles.length||tiles.length>4)throw new RangeError("Real 3D requires 1..4 DEM source tiles");
  }
  const heights=new Float64Array(grid.values.length).fill(NaN);
  if(elevationProvider==="cuzk-dmpok"){
    const dem=await (o.cuzkReader??fetchCuzkDmpOkRaster)(area,grid);
    if(dem.crs!=="EPSG:3857"||dem.width!==grid.width||dem.height!==grid.height ||
       dem.values.length!==heights.length)
      throw new Error("ČÚZK DMP OK must align exactly to the requested 3D sampling grid");
    heights.set(dem.values);
  }else{
    const windows:CogReadResult[]=await Promise.all(
      tiles.map(t=>(o.demReader??readCogWindowUrl)(t.url,t.window,options))
    );
    for(const window of windows){
      if(window.raster.crs!=="EPSG:4326")throw new Error("Copernicus DEM source CRS is not EPSG:4326");
      const aligned=reprojectRasterTo(window.raster,grid,"nearest");
      for(let i=0;i<heights.length;i++)
        if(Number.isFinite(aligned.values[i]))heights[i]=aligned.values[i]!;
    }
  }
  const verticalDatum=elevationProvider==="cuzk-dmpok"?CUZK_DMPOK_DATUM:"EGM2008 geoid";
  const demSource=elevationProvider==="cuzk-dmpok"?"ČÚZK DMP OK ArcGIS ImageServer":"Copernicus DEM GLO-30 public AWS COG";
  const demNativeResolutionM=elevationProvider==="cuzk-dmpok"?CUZK_DMPOK_NATIVE_RESOLUTION_M:30;
  const elevation:RasterGrid={...grid,values:heights,source:demSource,unit:"m "+verticalDatum};
  const statistics=rasterStatistics(elevation);
  if(statistics.valid<4)throw new Error("Copernicus DEM did not provide enough real elevation samples");
  const mesh=elevationToLocalMesh(elevation,{maxVertices:50_000});
  // This bounded local approximation removes Pseudo-Mercator sec(latitude) distortion.
  const latitude=(s+n)/2,localScale=Math.cos(latitude*Math.PI/180);
  for(let i=0;i<heights.length;i++){
    mesh.positions[3*i]=mesh.positions[3*i]!*localScale;
    mesh.positions[3*i+1]=mesh.positions[3*i+1]!*localScale;
  }
  if(!mesh.triangles.length)throw new Error("DEM samples do not form a connected 3D surface");
  const rgb=await rgbPromise;
  const bands=[rgb.bands.red,rgb.bands.green,rgb.bands.blue];
  const ranges=bands.map(contrastRange);
  const aligned=bands.map(b=>reprojectRasterTo(b,grid,"nearest"));
  const vertexRgb=new Uint8Array(grid.width*grid.height*3);
  const rgbValid=new Uint8Array(grid.width*grid.height);
  let colored=0;
  for(let i=0;i<rgbValid.length;i++){
    if(!Number.isFinite(heights[i])||aligned.some(b=>!Number.isFinite(b.values[i])||b.values[i]!<=0))continue;
    rgbValid[i]=1;colored++;
    for(let c=0;c<3;c++){
      const value=aligned[c]!.values[i]!,range=ranges[c]!;
      const norm=Math.max(0,Math.min(1,(value-range[0])/(range[1]-range[0])));
      vertexRgb[i*3+c]=Math.round(255*Math.pow(norm,0.87));
    }
  }
  if(colored===0)throw new Error("Sentinel-2 has no valid pixels aligned with the selected DEM");
  const sourceSpacing=rgb.nativeResolutionM;
  const textureGroundResolutionM=sourceSpacing!==null && Number.isFinite(sourceSpacing) &&
    sourceSpacing>=5 && sourceSpacing<=60 ? sourceSpacing : resolutionM;
  const textureGrid=outputGrid(area,textureGroundResolutionM,262_144);
  const textureBands=bands.map(b=>reprojectRasterTo(b,textureGrid,"nearest"));
  const rgba=new Uint8Array(textureGrid.width*textureGrid.height*4);
  let textureValidPixels=0;
  for(let i=0;i<textureGrid.width*textureGrid.height;i++){
    if(textureBands.some(b=>!Number.isFinite(b.values[i])||b.values[i]!<=0))continue;
    for(let c=0;c<3;c++){
      const value=textureBands[c]!.values[i]!,range=ranges[c]!;
      const norm=Math.max(0,Math.min(1,(value-range[0])/(range[1]-range[0])));
      rgba[i*4+c]=Math.round(255*Math.pow(norm,0.87));
    }
    rgba[i*4+3]=255;
    textureValidPixels++;
  }
  if(textureValidPixels===0)throw new Error("Sentinel-2 RGB texture has no observed pixels in the selected area");
  const imageryTexture={width:textureGrid.width,height:textureGrid.height,
    rgba,validPixels:textureValidPixels,groundResolutionM:textureGroundResolutionM};
  return {
    kind:elevationProvider==="cuzk-dmpok"?"satellite-rgb-on-cuzk-dmpok":"satellite-rgb-on-copernicus-dsm",
    elevation,mesh,vertexRgb,rgbValid,imageryTexture,
    metadata:{
      area:area.bbox,centerLatitudeDeg:latitude,groundResolutionM:resolutionM,
      sceneId:rgb.sceneId,acquiredAt:rgb.acquiredAt,sceneCloudPercent:rgb.sceneCloudPercent,
      imagerySource:rgb.provider,imageryNativeResolutionM:rgb.nativeResolutionM,
      demSource,demTileUrls:tiles.map(t=>t.url),verticalDatum,
      elevationProvider,demNativeResolutionM,
      ...(elevationProvider==="cuzk-dmpok"?{
        demServiceUrl:CUZK_DMPOK_SERVICE,
        demAttribution:"© ČÚZK — DMP OK, CC BY 4.0",
        demLicenseUrl:"https://creativecommons.org/licenses/by/4.0/"
      }:{}),
      sampledHeights:statistics.valid,totalHeights:heights.length,sampledColors:colored,
      textureGroundResolutionM,textureValidPixels,
      heightMinM:statistics.min!,heightMaxM:statistics.max!,
      warnings:[
        elevationProvider==="cuzk-dmpok" ? "Actual ČÚZK DMP OK F32 surface measurements sampled at requested grid; the source is photogrammetric, not a facade mesh." : "This is real DEM-based 2.5D: no photogrammetric building facades or measured sub-30m detail.",
        "Mesh colors are a legacy vertex sample; the independently sampled Sentinel-2 RGBA texture preserves native imaging detail.",
        elevationProvider==="cuzk-dmpok" ? "ČÚZK DMP OK is a 0.5m native raster; requested mesh spacing may be coarser. It includes roofs and vegetation but not walls." : "Copernicus DEM GLO-30 is a surface model with approximate 30m native spacing; output resampling adds no detail.",
        elevationProvider==="cuzk-dmpok" ? "ČÚZK DMP OK heights use Czech Bpv / Baltic 1957, NOT EGM2008. Never mix these datasets as equivalent heights." : "GLO-30 elevations are referenced to EGM2008, not WGS84 ellipsoid. No vertical datum conversion was applied.",
        "Sentinel-2 scene cloud percentage does not guarantee every pixel is cloud free.",
        ...rgb.warnings.filter(w=>!/^No DEM,/.test(w))
      ]
    }
  };
}
