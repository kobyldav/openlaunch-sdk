import { estimateFootprintCoverage, type FootprintCoverage } from "./footprint-coverage.js";
import { bbox as makeBbox, circle, type AreaOfInterest, type BBox, type Position } from "../geo/types.js";
import type { ObservationDiscoveryClient, ObservationDiscoveryReport, ObservationLayer, ObservationProvider, ObservationScene, ObservationQueryStatus } from "./observations.js";
import { selectEoAssets, type EoLayerKind } from "../eo/products.js";
import { sceneDatetime } from "../eo/scenes.js";

export type ExploreArea =
  | { center: Position; radiusKm?: number; bounds?: never }
  | { bounds: BBox; center?: never; radiusKm?: never };
export type ExploreSort = "newest" | "least-cloudy";
export interface ExploreObservationsOptions {
  area: ExploreArea;
  from: Date | string;
  to: Date | string;
  /** Defaults to optical, radar, thermal. Static DEM is explicitly opt-in. */
  layers?: readonly ObservationLayer[];
  maxCloudCoverPercent?: number;
  perSourceLimit?: number;
  maxResults?: number;
  sort?: ExploreSort;
  /** 0..100; when >0, scenes without usable footprint are excluded. */
  minFootprintCoveragePercent?: number;
}
export interface ExploredAsset {
  key: string;
  kind: EoLayerKind;
  groundSampleDistanceM: number | null;
}
export interface ExploredObservation {
  /** Composite ID avoids collisions between independent providers/collections. */
  id: string;
  sourceId: string;
  provider: ObservationProvider;
  layer: ObservationLayer;
  collection: string | null;
  acquiredAt: string | null;
  acquisitionTimeSource: "stac-metadata" | "not-declared";
  /** Scene-wide cloud metadata, NOT cloud cover over the user's selected AOI. */
  cloudCoverPercent: number | null;
  resolutionMetres: number[];
  assets: ExploredAsset[];
  /** A declared preview href is only a pointer, not a verified deliverable. */
  previewUrl: string | null;
  previewVerified: false;
  footprintCoveragePercent: number | null;
  footprintCoverageBasis: FootprintCoverage["basis"];
  pixelCoverageVerified: false;
  catalogOnly: true;
}
export interface ExploreObservationsReport {
  area: AreaOfInterest;
  from: string;
  to: string;
  queryStatuses: Array<Omit<ObservationQueryStatus,"message"> & { message?: string }>;
  status: "complete" | "partial" | "unavailable";
  observations: ExploredObservation[];
  returned: number;
  truncated: boolean;
  /** All counts refer only to the bounded returned page, not all remote observations. */
  countsByLayer: Partial<Record<ObservationLayer,number>>;
  warnings: string[];
  catalogOnly: true;
}

function integer(value:number|undefined, fallback:number, max:number, label:string):number {
  const n=value??fallback;
  if(!Number.isSafeInteger(n)||n<1||n>max)throw new RangeError(label+" must be 1.."+max);
  return n;
}
function resolveArea(value:ExploreArea):AreaOfInterest {
  if("bounds" in value && value.bounds !== undefined) {
    if(!Array.isArray(value.bounds)||value.bounds.length!==4)
      throw new RangeError("bounds must be [west,south,east,north]");
    return makeBbox(value.bounds[0]!,value.bounds[1]!,value.bounds[2]!,value.bounds[3]!);
  }
  if("center" in value && value.center !== undefined) {
    const center=value.center;
    if(!Array.isArray(center)||center.length!==2)
      throw new RangeError("center must be [longitude,latitude]");
    const radius=value.radiusKm??10;
    if(!Number.isFinite(radius)||radius<0.1||radius>200)
      throw new RangeError("radiusKm must be between 0.1 and 200");
    const result=circle(center,radius,32);
    // The existing simple bounding-box metadata cannot represent antimeridian wrapping.
    if(result.bbox[2]-result.bbox[0]>180)
      throw new RangeError("Antimeridian-spanning areas are not supported by the explorer");
    return result;
  }
  throw new RangeError("Specify area.center or area.bounds");
}
function date(value:Date|string,label:string):Date {
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))throw new RangeError("Invalid "+label+" date");
  return parsed;
}
function httpsLink(href:string):string|null {
  try {const url=new URL(href);return url.protocol==="https:"?url.href:null;}catch{return null;}
}
function sceneView(scene:ObservationScene,area:AreaOfInterest):ExploredObservation|null {
  if(!scene.product.assets.length)return null;
  const time=sceneDatetime(scene.item);
  const cloud=scene.product.sceneCloudCoverPercent;
  const coverage=estimateFootprintCoverage(area,scene.item.geometry);
  const previews=selectEoAssets(scene.product,"preview");
  const previewUrl=previews.map(a=>httpsLink(a.href)).find((x):x is string=>x!==null)??null;
  return {
    id:[scene.provider,scene.item.collection??"unknown",scene.item.id].join(":"),
    sourceId:scene.item.id,provider:scene.provider,layer:scene.layer,
    collection:scene.item.collection??null,
    acquiredAt:time?.toISOString()??null,
    acquisitionTimeSource:time?"stac-metadata":"not-declared",
    cloudCoverPercent:cloud!==undefined&&cloud>=0&&cloud<=100?cloud:null,
    resolutionMetres:[...scene.product.availableResolutionsM],
    assets:scene.product.assets.map(a=>({
      key:a.key,kind:a.kind,groundSampleDistanceM:a.groundSampleDistanceM??null,
    })),
    previewUrl,previewVerified:false,
    footprintCoveragePercent:coverage.coveragePercent,
    footprintCoverageBasis:coverage.basis,pixelCoverageVerified:false,catalogOnly:true,
  };
}
/** Reuses OpenLaunch's real multi-provider STAC query. Never fetches or invents pixels. */
export async function exploreSpaceObservations(
  discovery:Pick<ObservationDiscoveryClient,"discover">,
  options:ExploreObservationsOptions,
):Promise<ExploreObservationsReport> {
  const area=resolveArea(options.area);
  const from=date(options.from,"from"),to=date(options.to,"to");
  if(to<from)throw new RangeError("Observation interval requires from <= to");
  const perSourceLimit=integer(options.perSourceLimit,15,50,"perSourceLimit");
  const maxResults=integer(options.maxResults,30,100,"maxResults");
  const sort=options.sort??"newest";
  if(sort!=="newest"&&sort!=="least-cloudy")throw new RangeError("Unsupported scene sort");
  const layers=options.layers??["optical","radar","thermal"];
  if(!Array.isArray(layers)||layers.length===0||layers.length>4)
    throw new RangeError("Select between one and four observation layers");
  const allowed=new Set<ObservationLayer>(["optical","radar","thermal","elevation"]);
  for(const layer of layers)if(!allowed.has(layer))throw new RangeError("Unknown observation layer");
  const minCoverage=options.minFootprintCoveragePercent??0;
  if(!Number.isFinite(minCoverage)||minCoverage<0||minCoverage>100)
    throw new RangeError("minFootprintCoveragePercent must be 0..100");
  const cloud=options.maxCloudCoverPercent;
  if(cloud!==undefined&&(!Number.isFinite(cloud)||cloud<0||cloud>100))
    throw new RangeError("maxCloudCoverPercent must be 0..100");
  const request={
    area,from,to,layers:[...new Set(layers)],
    perQueryLimit:perSourceLimit,
    ...(cloud!==undefined?{maxCloudCoverPercent:cloud}:{}),
  };
  const data:ObservationDiscoveryReport=await discovery.discover(request);
  const candidates=new Map<string,ExploredObservation>();
  for(const scene of data.scenes) {
    if(!allowed.has(scene.layer)||!layers.includes(scene.layer))continue;
    const view=sceneView(scene,area);
    if(!view)continue;
    if(minCoverage>0&&(view.footprintCoveragePercent===null||
      view.footprintCoveragePercent<minCoverage))continue;
    // Include records with no datetime only for static elevation; never label
    // undated optical/radar/thermal records as genuine historical observations.
    const time=view.acquiredAt?Date.parse(view.acquiredAt):NaN;
    if(scene.layer!=="elevation"&&(!Number.isFinite(time)||time<from.getTime()||time>to.getTime()))continue;
    if(cloud!==undefined&&scene.layer==="optical"&&view.cloudCoverPercent!==null&&view.cloudCoverPercent>cloud)continue;
    if(!candidates.has(view.id))candidates.set(view.id,view);
  }
  const rows=[...candidates.values()];
  rows.sort((a,b)=>{
    if(sort==="least-cloudy") {
      const aCloud=a.cloudCoverPercent??101,bCloud=b.cloudCoverPercent??101;
      if(aCloud!==bCloud)return aCloud-bCloud;
    }
    const aTime=a.acquiredAt?Date.parse(a.acquiredAt):-Infinity;
    const bTime=b.acquiredAt?Date.parse(b.acquiredAt):-Infinity;
    return bTime-aTime||a.id.localeCompare(b.id);
  });
  const observations=rows.slice(0,maxResults);
  const queryStatuses=data.queryStatuses.map(({message,...status})=>({
    ...status,
    ...(status.status==="error"?{message:"Provider request failed; results may be incomplete."}:{})
  }));
  const failed=queryStatuses.filter(x=>x.status==="error").length;
  const status=failed===0?"complete":failed===queryStatuses.length?"unavailable":"partial";
  const countsByLayer:Partial<Record<ObservationLayer,number>>={};
  for(const item of observations)countsByLayer[item.layer]=(countsByLayer[item.layer]??0)+1;
  return {
    area,from:from.toISOString(),to:to.toISOString(),queryStatuses,status,
    observations,returned:observations.length,truncated:rows.length>maxResults,
    countsByLayer,catalogOnly:true,
    warnings:[
      "STAC search results are catalog metadata, not verified pixels or a confirmed downloadable scene.",
      "Preview URLs may require signed access; never interpret a metadata pointer as a playable image.",
      "Cloud coverage is an estimate for the scene, not necessarily the chosen location.",
      "Footprint overlap is an approximate STAC polygon intersection, not a check that delivered pixels cover the AOI.",
      "Results are bounded by per-provider pagination and may omit other scenes.",
      ...(layers.includes("elevation")?["Static terrain is not a dated observation, even when grouped in search results."]:[]),
      ...(failed?["Some providers failed: this is a partial catalog search, not an empty Earth observation history."]:[]),
      ...data.warnings.filter(w=>!/provider queries failed/i.test(w)),
    ],
  };
}
