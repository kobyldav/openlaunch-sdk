import type {BBox} from "../geo/types.js";
import type {ObservationLayer,ObservationProvider} from "./observations.js";
import type {ExploreObservationsOptions,ExploreObservationsReport,ExploredObservation} from "./observation-explorer.js";
import type {ObservationPreviewRequest,VerifiedObservationPreview} from "./observation-preview.js";
import type {GibsTileDescriptor,GibsLayerId} from "../providers/gibs.js";

/** Strictly supported STAC layer choices for the public map. */
export type WebMapSceneLayer="sentinel2-optical"|"sentinel1-radar"|"landsat-temperature"|"dem-terrain"|"archive-scenes";
export type WebMapDailyLayer="nasa-modis-terra"|"nasa-viirs-noaa20";
const SCENE_LAYERS:Readonly<Record<WebMapSceneLayer,readonly ObservationLayer[]>>={
  "sentinel2-optical":["optical"],
  "sentinel1-radar":["radar"],
  "landsat-temperature":["thermal"],
  "dem-terrain":["elevation"],
  "archive-scenes":["optical","radar","thermal"],
};
const DAILY_LAYERS:Readonly<Record<WebMapDailyLayer,GibsLayerId>>={
  "nasa-modis-terra":"MODIS_Terra_CorrectedReflectance_TrueColor",
  "nasa-viirs-noaa20":"VIIRS_NOAA20_CorrectedReflectance_TrueColor",
};
export interface WebMapSearchRequest extends Omit<ExploreObservationsOptions,"layers"> {
  layer:WebMapSceneLayer;
}
export interface WebMapPreviewChoice {
  /** Provider-declared preview link is never exposed; this is only an identity selector. */
  state:"declared-unverified"|"not-declared";
  request:ObservationPreviewRequest|null;
}
export interface WebMapScene {
  key:string;
  provider:ObservationProvider;
  layer:ObservationLayer;
  collection:string|null;
  itemId:string;
  acquiredAt:string|null;
  acquisitionTimeBasis:"stac-metadata"|"not-declared";
  cloudCoverPercent:number|null;
  resolutionMetres:number[];
  footprintCoveragePercent:number|null;
  pixelCoverageVerified:false;
  /** Scene metadata is not proof of delivered image bytes. */
  preview:WebMapPreviewChoice;
  catalogOnly:true;
}
export interface WebMapSearchResult {
  layer:WebMapSceneLayer;
  status:"ready"|"empty"|"partial"|"unavailable";
  catalogStatus:ExploreObservationsReport["status"];
  areaBounds:BBox;
  from:string;
  to:string;
  scenes:WebMapScene[];
  returned:number;
  truncated:boolean;
  verifiedAcquisition:false;
  /** Guaranteed JSON-safe and never includes remote signed STAC hrefs. */
  warnings:string[];
  /** Scoped provider statuses permit the web to display genuine outages. */
  providers:Array<{provider:ObservationProvider;layer:ObservationLayer;status:"ok"|"error";returned:number}>;
}
export interface WebMapDailyRequest {layer:WebMapDailyLayer;date:Date|string;}
export interface WebMapDailyResult {
  layer:WebMapDailyLayer;
  provider:"nasa-gibs";
  kind:"wmts-xyz";
  urlTemplate:string;
  requestedDate:string;
  maxZoom:number;
  attribution:string;
  observedAt:null;
  verifiedAcquisition:false;
  delivery:"unchecked";
  note:string;
}
export interface WebMapClients {
  exploreObservations(options:ExploreObservationsOptions):Promise<ExploreObservationsReport>;
  nasaDailyTiles(layer:GibsLayerId,date:Date|string):GibsTileDescriptor;
}

function layerSelection(layer:WebMapSceneLayer):readonly ObservationLayer[]{
  if(!Object.hasOwn(SCENE_LAYERS,layer))
    throw new RangeError("Unsupported web map scene layer");
  return SCENE_LAYERS[layer]!;
}
function previewSelector(item:ExploredObservation):ObservationPreviewRequest|null {
  if(item.previewUrl===null)return null;
  if(item.provider==="copernicus"&&
    (item.collection==="sentinel-2-l2a"||item.collection==="sentinel-1-grd"))
    return {provider:item.provider,collection:item.collection,itemId:item.sourceId};
  if(item.provider==="planetary-computer"&&
    (item.collection==="landsat-c2-l2"||item.collection==="cop-dem-glo-30"))
    return {provider:item.provider,collection:item.collection,itemId:item.sourceId};
  return null;
}
function toWebScene(item:ExploredObservation):WebMapScene{
  const request=previewSelector(item);
  return {
    key:item.id,provider:item.provider,layer:item.layer,collection:item.collection,
    itemId:item.sourceId,acquiredAt:item.acquiredAt,
    acquisitionTimeBasis:item.acquisitionTimeSource,
    cloudCoverPercent:item.cloudCoverPercent,
    resolutionMetres:[...item.resolutionMetres],
    footprintCoveragePercent:item.footprintCoveragePercent,
    pixelCoverageVerified:false,catalogOnly:true,
    preview:{state:request?"declared-unverified":"not-declared",request},
  };
}
/**
 * A JSON-safe location->layer->scene catalog for MapLibre/Next.js.
 * Keeps signed catalog preview URLs and sensitive provider messages server-side.
 * Actual binary image delivery is a *separate* explicit verified SDK request.
 */
export async function buildWebMapSearch(
  clients:Pick<WebMapClients,"exploreObservations">,
  request:WebMapSearchRequest,
):Promise<WebMapSearchResult>{
  const layers=layerSelection(request.layer);
  const {layer:_layer,...search}=request;
  // Caller cannot smuggle arbitrary layers through this public web contract.
  const catalog=await clients.exploreObservations({...search,layers});
  const valid=new Set(layers);
  const scenes=catalog.observations.filter(scene=>valid.has(scene.layer)).map(toWebScene);
  const status=catalog.status==="unavailable"?"unavailable":
    catalog.status==="partial"?"partial":scenes.length?"ready":"empty";
  return {
    layer:request.layer,status,catalogStatus:catalog.status,
    areaBounds:[...catalog.area.bbox] as BBox,
    from:catalog.from,to:catalog.to,
    scenes,returned:scenes.length,truncated:catalog.truncated,
    verifiedAcquisition:false,
    providers:catalog.queryStatuses.map(q=>({provider:q.provider,layer:q.layer,status:q.status,returned:q.returned})),
    // Fixed provenance statements only: arbitrary provider warnings may include URLs/tokens.
    warnings:[
      "Results are STAC catalog metadata, not proof of delivered imagery or acquisition.",
      "Cloud cover and footprint coverage are catalog estimates, not verified local pixels.",
      "Preview status declared-unverified is only a provider link; request an image separately by scene identity.",
      ...(catalog.status!=="complete"?["A provider failed or returned partial results; an empty scene list is not proof that no imagery exists."]:[]),
      ...(catalog.truncated?["Results are capped; later scenes may exist outside the current response."]:[]),
    ],
  };
}
/** Official NASA GIBS XYZ tile template; a requested day is not a validated capture. */
export function buildWebMapDaily(
  clients:Pick<WebMapClients,"nasaDailyTiles">,
  request:WebMapDailyRequest,
):WebMapDailyResult {
  if(!Object.hasOwn(DAILY_LAYERS,request.layer))
    throw new RangeError("Unsupported web map daily layer");
  const source=clients.nasaDailyTiles(DAILY_LAYERS[request.layer]!,request.date);
  // Only official NASA GIBS response templates; never arbitrary STAC/image links.
  if(source.provider!=="nasa-gibs"||source.kind!=="wmts-xyz"||
      !source.urlTemplate.startsWith("https://gibs.earthdata.nasa.gov/"))
    throw new Error("Unexpected NASA map descriptor");
  return {
    layer:request.layer,provider:"nasa-gibs",kind:"wmts-xyz",
    urlTemplate:source.urlTemplate,requestedDate:source.requestedDate,
    maxZoom:source.maxZoom,attribution:source.attribution,
    observedAt:null,verifiedAcquisition:false,delivery:"unchecked",
    note:"Daily NASA tile descriptor. The exact requested tile and acquisition time are not verified.",
  };
}
