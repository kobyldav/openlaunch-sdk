import type { ExploreObservationsOptions, ExploreObservationsReport, ExploredObservation } from "./observation-explorer.js";
import type { ObservationPreviewRequest, VerifiedObservationPreview } from "./observation-preview.js";
import type { ObservationLayer } from "./observations.js";

export type BestPreviewStrategy = "balanced" | "recent";
export interface BestPreviewOptions extends ExploreObservationsOptions {
  /** Opt-in network budget, 1..5 attempts, defaults to 3. */
  maxAttempts?: number;
  /** Balanced cloud/age/resolution heuristic or age-first heuristic. */
  strategy?: BestPreviewStrategy;
}
export interface BestPreviewAttempt {
  id: string;
  provider: string;
  /** A single STAC item lookup and image download was attempted. */
  outcome: "delivered" | "failed";
  /** Never contains raw provider errors or signed URLs. */
  note: string;
}
export interface BestPreviewChoice {
  /** Source catalog metadata with potentially signed previewUrl removed. */
  observation: Omit<ExploredObservation, "previewUrl">;
  /** JPEG/PNG bytes verified by SDK; never contains a signed origin URL. */
  preview: VerifiedObservationPreview;
  /** Only a ranking heuristic over catalog metadata, not a pixel quality grade. */
  catalogScore: number;
}
export interface BestPreviewReport {
  status: "delivered" | "no-preview-candidates" | "not-delivered";
  catalogStatus: ExploreObservationsReport["status"];
  selected: BestPreviewChoice | null;
  candidateCount: number;
  attempted: number;
  fallbackUsed: boolean;
  maxAttempts: number;
  attempts: BestPreviewAttempt[];
  /** True only if actual preview bytes were checked. */
  imageDelivered: boolean;
  verifiedAcquisition: false;
  warnings: string[];
}
export interface BestPreviewClients {
  exploreObservations(options:ExploreObservationsOptions):Promise<ExploreObservationsReport>;
  fetchObservationPreview(request:ObservationPreviewRequest):Promise<VerifiedObservationPreview>;
}

function candidateRequest(candidate:ExploredObservation):ObservationPreviewRequest|null {
  if(candidate.provider==="copernicus"&&
     (candidate.collection==="sentinel-2-l2a"||candidate.collection==="sentinel-1-grd"))
    return {provider:candidate.provider,collection:candidate.collection,itemId:candidate.sourceId};
  if(candidate.provider==="planetary-computer"&&
     (candidate.collection==="landsat-c2-l2"||candidate.collection==="cop-dem-glo-30"))
    return {provider:candidate.provider,collection:candidate.collection,itemId:candidate.sourceId};
  return null;
}
function catalogScore(item:ExploredObservation, until:number, strategy:BestPreviewStrategy):number {
  const timestamp=item.acquiredAt===null?NaN:Date.parse(item.acquiredAt);
  const days=Number.isFinite(timestamp)?Math.max(0,(until-timestamp)/86_400_000):3650;
  // The recent strategy uses a 30-day decay so it really prioritizes timestamp.
  const newest=Math.max(0,1-Math.min(1,days/(strategy==="recent"?30:365)));
  const cloud=item.cloudCoverPercent;
  // No scene cloud metadata -> neutral, not "perfectly clear".
  const clear=cloud===null?0.35:1-cloud/100;
  const metres=item.resolutionMetres.filter(m=>Number.isFinite(m)&&m>0);
  const best=metres.length?Math.min(...metres):null;
  // This metadata describes the source product, NOT preview image resolution.
  const detail=best===null?0.25:Math.max(0,Math.min(1,30/best));
  const optical=item.layer==="optical"?1:0;
  const raw=strategy==="recent"
    ? newest*70+clear*12+detail*8+optical*10
    : newest*24+clear*42+detail*14+optical*20;
  return Math.round(raw*100)/100;
}
function noLink(item:ExploredObservation):Omit<ExploredObservation,"previewUrl">{
  const {previewUrl: _previewUrl, ...clean}=item;
  return clean;
}
function attemptsLimit(value:number|undefined):number {
  const v=value??3;
  if(!Number.isSafeInteger(v)||v<1||v>5)throw new RangeError("maxAttempts must be 1..5");
  return v;
}

/**
 * Find the best *catalog candidate*, then verify delivery of its binary
 * preview. Falls back sequentially if a candidate is missing, blocked or
 * unavailable. Never exposes signed URLs or asserts actual AOI pixel quality.
 */
export async function findBestAvailableObservationPreview(
  clients:BestPreviewClients,options:BestPreviewOptions,
):Promise<BestPreviewReport> {
  const maxAttempts=attemptsLimit(options.maxAttempts);
  const strategy=options.strategy??"balanced";
  if(strategy!=="balanced"&&strategy!=="recent")throw new RangeError("Unknown preview selection strategy");
  const catalog=await clients.exploreObservations(options);
  const until=Date.parse(catalog.to);
  const candidates=catalog.observations
    .filter(item=>item.previewUrl!==null&&candidateRequest(item)!==null)
    .map(item=>({item,score:catalogScore(item,until,strategy)}))
    .sort((a,b)=>b.score-a.score||(b.item.acquiredAt??"").localeCompare(a.item.acquiredAt??"")||a.item.id.localeCompare(b.item.id));
  const warnings=[
    "Rankings use catalog-level time, scene cloud cover and declared resolution, not inspected image pixels or local clear-sky conditions.",
    "Only a successful HTTPS JPEG/PNG download confirms preview byte delivery; previews are not full-resolution scientific scenes.",
    "The SDK keeps signed asset URLs out of this response; enforce authorization, rate limits and request quotas in the backend.",
    ...catalog.warnings,
  ];
  const attempts:BestPreviewAttempt[]=[];
  let selected:BestPreviewChoice|null=null;
  for(const candidate of candidates.slice(0,maxAttempts)) {
    const request=candidateRequest(candidate.item);
    if(!request)continue;
    try{
      const preview=await clients.fetchObservationPreview(request);
      // Defend against accidental/malicious adapter mismatch.
      if(preview.provider!==request.provider||preview.collection!==request.collection||
        preview.itemId!==request.itemId||preview.previewVerified!==true||preview.imageDelivered!==true)
        throw new Error("Preview identity or delivery not verified");
      selected={observation:noLink(candidate.item),preview,catalogScore:candidate.score};
      attempts.push({id:candidate.item.id,provider:candidate.item.provider,outcome:"delivered",note:"Actual preview image bytes verified"});
      break;
    }catch{
      attempts.push({id:candidate.item.id,provider:candidate.item.provider,outcome:"failed",note:"Preview could not be delivered or validated"});
    }
  }
  return {
    status:selected?"delivered":candidates.length?"not-delivered":"no-preview-candidates",
    catalogStatus:catalog.status,selected,candidateCount:candidates.length,
    attempted:attempts.length,fallbackUsed:attempts.length>1,
    maxAttempts,attempts,imageDelivered:selected!==null,
    verifiedAcquisition:false,warnings,
  };
}
