import { probeSpaceImage, type SpaceImageAvailability } from "./layer-health.js";
import { type MeteosatTimelineOptions, type MeteosatFrameTimeline, type MeteosatClient } from "../providers/meteosat.js";
import type { NasaGibsClient } from "../providers/gibs.js";

/** Backend-only, bounded frame checks. The provider-advertised TIME is not an acquisition timestamp. */
export interface MeteosatVerifiedFrame {
  advertisedTime:string;
  availability:SpaceImageAvailability;
  mapUrl:string;
  playable:boolean;
}
export interface MeteosatPlaybackResult {
  layer:string;
  generatedAt:string;
  timelineStatus:MeteosatFrameTimeline["status"];
  frames:MeteosatVerifiedFrame[];
  checkedFrames:number;
  playableFrames:number;
  verifiedAcquisition:false;
  warnings:readonly string[];
}
export interface MeteosatPlaybackOptions extends MeteosatTimelineOptions{
  /** Bound network cost to 1-12 per call. Default 4. */
  maxChecks?:number;
}
export async function checkMeteosatPlayback(
  meteosat:Pick<MeteosatClient,"timeline"|"fetchMap">,
  gibs:Pick<NasaGibsClient,"fetchTile">,
  options:MeteosatPlaybackOptions,
):Promise<MeteosatPlaybackResult>{
  const maxChecks=options.maxChecks??4;
  if(!Number.isSafeInteger(maxChecks)||maxChecks<1||maxChecks>12)
    throw new RangeError("maxChecks must be 1..12");
  const timeline=await meteosat.timeline(options);
  const chosen=timeline.frames.slice(-maxChecks);
  const frames:MeteosatVerifiedFrame[]=[];
  // Sequential checks avoid accidental request bursts against EUMETView.
  for(const item of chosen){
    const map={
      layer:options.layer,bounds3857:options.bounds3857,
      width:options.width,height:options.height,time:item.advertisedTime,
      ...(options.format?{format:options.format}:{}),
    };
    const availability=await probeSpaceImage({meteosat,gibs},{source:"meteosat",map});
    frames.push({
      advertisedTime:item.advertisedTime,
      availability,
      mapUrl:item.request.url,
      playable:availability.status==="available",
    });
  }
  return {
    layer:timeline.layer,generatedAt:new Date().toISOString(),
    timelineStatus:timeline.status,frames,
    checkedFrames:frames.length,playableFrames:frames.filter(f=>f.playable).length,
    verifiedAcquisition:false,
    warnings:[
      "Successful WMS image response confirms delivery, not capture time or cloud coverage.",
      "Frame URLs depend on provider availability; use backend caching and attribution.",
      "This call performs bounded provider requests; do not poll continuously from a public browser.",
    ],
  };
}
