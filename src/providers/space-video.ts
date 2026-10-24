import { METEOSAT_EUROPE_STREAM } from "./meteosat.js";
export type SpaceStreamId="iss-earth-live"|"meteosat-europe-live";
export interface SpaceStreamDescriptor {
  id:SpaceStreamId;
  title:string;provider:"NASA"|"EUMETSAT";source:string;
  kind:"embedded-external-video";
  watchUrl:string;embedUrl:string;officialSourceUrl:string;
  embedding:"iframe";
  availability:"not-checked";
  observedAt:null;
  isGeoreferenced:false;
  documentedFrameIntervalMinutes:number|null;
  documentedLatencyMinutes:number|null;
  advisory:string;
}
const streams:readonly SpaceStreamDescriptor[]=Object.freeze([
  {
    id:"iss-earth-live",title:"ISS Earth live camera",provider:"NASA",
    source:"International Space Station external camera",
    kind:"embedded-external-video",
    watchUrl:"https://www.youtube.com/watch?v=jKHvbJe9c_Y",
    embedUrl:"https://www.youtube-nocookie.com/embed/jKHvbJe9c_Y",
    officialSourceUrl:"https://www.nasa.gov/live/",
    embedding:"iframe",availability:"not-checked",observedAt:null,isGeoreferenced:false,
    documentedFrameIntervalMinutes:null,documentedLatencyMinutes:null,
    advisory:"NASA official public ISS stream can be interrupted, become private or display previously recorded footage. It is not a map raster, telemetry feed, or continuously over Czechia.",
  },
  {
    id:"meteosat-europe-live",title:"Meteosat-12 Europe earth view",provider:"EUMETSAT",
    source:"Meteosat Third Generation weather satellite",kind:"embedded-external-video",
    watchUrl:METEOSAT_EUROPE_STREAM.watchUrl,embedUrl:METEOSAT_EUROPE_STREAM.embedUrl,
    officialSourceUrl:METEOSAT_EUROPE_STREAM.officialPage,
    embedding:"iframe",availability:"not-checked",observedAt:null,isGeoreferenced:false,
    documentedFrameIntervalMinutes:METEOSAT_EUROPE_STREAM.nominalUpdateMinutes,
    documentedLatencyMinutes:METEOSAT_EUROPE_STREAM.documentedDelayMinutes,
    advisory:"EUMETSAT composite frames typically update every 10 min with ~30 min processing delay. Playback status is not checked and may be unavailable.",
  },
]);
export class SpaceVideoClient{
  list():SpaceStreamDescriptor[]{return streams.map(s=>({...s}));}
  get(id:SpaceStreamId):SpaceStreamDescriptor{
    const item=streams.find(s=>s.id===id);
    if(!item)throw new RangeError("Unknown official space stream");
    return {...item};
  }
}
