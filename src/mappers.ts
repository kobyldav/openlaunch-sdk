import { ParseError } from "./errors.js";
import type { Agency, Astronaut, Launch, LaunchPad, Mission, Rocket, SpaceEvent, StatusRef } from "./types.js";
import { bool, date, get, id, imageFrom, isRecord, num, str, videosFrom } from "./utils.js";

function requiredId(raw: unknown): string | number {
  const value = id(get(raw, "id"));
  if (value === undefined) throw new ParseError("Entity is missing id", raw);
  return value;
}
function requiredName(raw: unknown): string {
  const value = str(get(raw, "name"));
  if (!value) throw new ParseError("Entity is missing name", raw);
  return value;
}
function source(raw: unknown) {
  const result: { provider: "launch-library-2"; id: string | number; url?: string } = {
    provider: "launch-library-2",
    id: requiredId(raw),
  };
  const url = str(get(raw, "url")); if (url) result.url = url;
  return result;
}
function country(raw: unknown) {
  const object = isRecord(raw) ? raw : undefined;
  if (!object) return undefined;
  const name = str(object.name); if (!name) return undefined;
  const out: { name: string; code?: string } = { name };
  const code = str(object.alpha_2_code) ?? str(object.code); if (code) out.code = code;
  return out;
}
function status(raw: unknown): StatusRef {
  if (!isRecord(raw)) return { name: "Unknown" };
  const out: StatusRef = { name: str(raw.name) ?? "Unknown" };
  const statusId = id(raw.id); if (statusId !== undefined) out.id = statusId;
  const abbreviation = str(raw.abbrev); if (abbreviation) out.abbreviation = abbreviation;
  const description = str(raw.description); if (description) out.description = description;
  return out;
}

export function mapAgency(raw: unknown): Agency {
  const out: Agency = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
  const abbreviation = str(get(raw, "abbrev")); if (abbreviation) out.abbreviation = abbreviation;
  const type = str(get(raw, "type.name")) ?? str(get(raw, "type")); if (type) out.type = type;
  const c = country(get(raw, "country")); if (c) out.country = c;
  const administrator = str(get(raw, "administrator")); if (administrator) out.administrator = administrator;
  const foundingYear = num(get(raw, "founding_year")); if (foundingYear !== undefined) out.foundingYear = foundingYear;
  const description = str(get(raw, "description")); if (description) out.description = description;
  const website = str(get(raw, "url")) ?? str(get(raw, "website")); if (website) out.website = website;
  const wikiUrl = str(get(raw, "wiki_url")); if (wikiUrl) out.wikiUrl = wikiUrl;
  const logo = imageFrom(get(raw, "logo")); if (logo) out.logo = logo;
  const image = imageFrom(get(raw, "image")); if (image) out.image = image;
  return out;
}

export function mapRocket(raw: unknown): Rocket {
  const out: Rocket = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
  const fullName = str(get(raw, "full_name")); if (fullName) out.fullName = fullName;
  if (isRecord(get(raw, "manufacturer"))) out.manufacturer = mapAgency(get(raw, "manufacturer"));
  const active = bool(get(raw, "active")); if (active !== undefined) out.active = active;
  const reusable = bool(get(raw, "reusable")); if (reusable !== undefined) out.reusable = reusable;
  const maidenFlight = date(get(raw, "maiden_flight")); if (maidenFlight) out.maidenFlight = maidenFlight;
  const lengthMeters = num(get(raw, "length")); if (lengthMeters !== undefined) out.lengthMeters = lengthMeters;
  const diameterMeters = num(get(raw, "diameter")); if (diameterMeters !== undefined) out.diameterMeters = diameterMeters;
  const launchMassKg = num(get(raw, "launch_mass")); if (launchMassKg !== undefined) out.launchMassKg = launchMassKg;
  const leoCapacityKg = num(get(raw, "leo_capacity")); if (leoCapacityKg !== undefined) out.leoCapacityKg = leoCapacityKg;
  const gtoCapacityKg = num(get(raw, "gto_capacity")); if (gtoCapacityKg !== undefined) out.gtoCapacityKg = gtoCapacityKg;
  const successfulLaunches = num(get(raw, "successful_launches")); if (successfulLaunches !== undefined) out.successfulLaunches = successfulLaunches;
  const failedLaunches = num(get(raw, "failed_launches")); if (failedLaunches !== undefined) out.failedLaunches = failedLaunches;
  const totalLaunches = num(get(raw, "total_launch_count")); if (totalLaunches !== undefined) out.totalLaunches = totalLaunches;
  const description = str(get(raw, "description")); if (description) out.description = description;
  const wikiUrl = str(get(raw, "wiki_url")); if (wikiUrl) out.wikiUrl = wikiUrl;
  const infoUrl = str(get(raw, "info_url")); if (infoUrl) out.infoUrl = infoUrl;
  const image = imageFrom(get(raw, "image")); if (image) out.image = image;
  return out;
}

export function mapPad(raw: unknown): LaunchPad {
  const out: LaunchPad = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
  const location = str(get(raw, "location.name")); if (location) out.location = location;
  const c = country(get(raw, "country")) ?? country(get(raw, "location.country")); if (c) out.country = c;
  const latitude = num(get(raw, "latitude")); if (latitude !== undefined) out.latitude = latitude;
  const longitude = num(get(raw, "longitude")); if (longitude !== undefined) out.longitude = longitude;
  const active = bool(get(raw, "active")); if (active !== undefined) out.active = active;
  const description = str(get(raw, "description")); if (description) out.description = description;
  const mapUrl = str(get(raw, "map_url")); if (mapUrl) out.mapUrl = mapUrl;
  const wikiUrl = str(get(raw, "wiki_url")); if (wikiUrl) out.wikiUrl = wikiUrl;
  const image = imageFrom(get(raw, "image")); if (image) out.image = image;
  return out;
}

function mapMission(raw: unknown): Mission | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Mission = {};
  const missionId = id(raw.id); if (missionId !== undefined) out.id = missionId;
  const name = str(raw.name); if (name) out.name = name;
  const description = str(raw.description); if (description) out.description = description;
  const type = str(raw.type); if (type) out.type = type;
  const orbitName = str(get(raw, "orbit.name"));
  if (orbitName) {
    out.orbit = { name: orbitName };
    const abbreviation = str(get(raw, "orbit.abbrev")); if (abbreviation) out.orbit.abbreviation = abbreviation;
  }
  return Object.keys(out).length ? out : undefined;
}

export function mapLaunch(raw: unknown): Launch {
  const net = date(get(raw, "net"));
  if (!net) throw new ParseError("Launch is missing a valid NET date", raw);
  const allVideos = [
    ...videosFrom(get(raw, "vid_urls")),
    ...videosFrom(get(raw, "videos")),
  ];
  const directVideo = str(get(raw, "vidURLs.0.url")) ?? str(get(raw, "video_url"));
  if (directVideo && !allVideos.some((v) => v.url === directVideo)) allVideos.push({ url: directVideo });
  const featured = allVideos.find((v) => v.featured) ?? allVideos[0];
  const out: Launch = {
    id: requiredId(raw), name: requiredName(raw), status: status(get(raw, "status")), net,
    videos: allVideos, source: source(raw),
  };
  const slug = str(get(raw, "slug")); if (slug) out.slug = slug;
  const designator = str(get(raw, "launch_designator")); if (designator) out.designator = designator;
  const windowStart = date(get(raw, "window_start")); if (windowStart) out.windowStart = windowStart;
  const windowEnd = date(get(raw, "window_end")); if (windowEnd) out.windowEnd = windowEnd;
  const lastUpdated = date(get(raw, "last_updated")); if (lastUpdated) out.lastUpdated = lastUpdated;
  const probability = num(get(raw, "probability")); if (probability !== undefined) out.probability = probability;
  const holdReason = str(get(raw, "holdreason")) ?? str(get(raw, "hold_reason")); if (holdReason) out.holdReason = holdReason;
  const failReason = str(get(raw, "failreason")) ?? str(get(raw, "fail_reason")); if (failReason) out.failReason = failReason;
  const hashtag = str(get(raw, "hashtag")); if (hashtag) out.hashtag = hashtag;
  const rocketRaw = get(raw, "rocket.configuration"); if (isRecord(rocketRaw)) out.rocket = mapRocket(rocketRaw);
  const providerRaw = get(raw, "launch_service_provider"); if (isRecord(providerRaw)) out.provider = mapAgency(providerRaw);
  const padRaw = get(raw, "pad"); if (isRecord(padRaw)) out.pad = mapPad(padRaw);
  const mission = mapMission(get(raw, "mission")); if (mission) out.mission = mission;
  if (featured) out.webcast = featured;
  const image = imageFrom(get(raw, "image")); if (image) out.image = image;
  return out;
}

export function mapAstronaut(raw: unknown): Astronaut {
  const out: Astronaut = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
  const statusName = str(get(raw, "status.name")); if (statusName) out.status = statusName;
  const typeName = str(get(raw, "type.name")); if (typeName) out.type = typeName;
  const agencyRaw = get(raw, "agency"); if (isRecord(agencyRaw)) out.agency = mapAgency(agencyRaw);
  const nationality = str(get(raw, "nationality.0.nationality_name")) ?? str(get(raw, "nationality")); if (nationality) out.nationality = nationality;
  const bio = str(get(raw, "bio")); if (bio) out.bio = bio;
  const dob = date(get(raw, "date_of_birth")); if (dob) out.dateOfBirth = dob;
  const dod = date(get(raw, "date_of_death")); if (dod) out.dateOfDeath = dod;
  const first = date(get(raw, "first_flight")); if (first) out.firstFlight = first;
  const last = date(get(raw, "last_flight")); if (last) out.lastFlight = last;
  const flights = num(get(raw, "flights_count")); if (flights !== undefined) out.flightsCount = flights;
  const landings = num(get(raw, "landings_count")); if (landings !== undefined) out.landingsCount = landings;
  const spacewalks = num(get(raw, "spacewalks_count")); if (spacewalks !== undefined) out.spacewalksCount = spacewalks;
  const tis = str(get(raw, "time_in_space")); if (tis) out.timeInSpace = tis;
  const eva = str(get(raw, "eva_time")); if (eva) out.evaTime = eva;
  const inSpace = bool(get(raw, "in_space")); if (inSpace !== undefined) out.inSpace = inSpace;
  const image = imageFrom(get(raw, "image")); if (image) out.image = image;
  return out;
}

export function mapEvent(raw: unknown): SpaceEvent {
  const eventDate = date(get(raw, "date")); if (!eventDate) throw new ParseError("Event is missing a valid date", raw);
  const allVideos = videosFrom(get(raw, "vid_urls"));
  const featured = allVideos.find((v) => v.featured) ?? allVideos[0];
  const out: SpaceEvent = { id: requiredId(raw), name: requiredName(raw), date: eventDate, videos: allVideos, source: source(raw) };
  const type = str(get(raw, "type.name")) ?? str(get(raw, "type")); if (type) out.type = type;
  const description = str(get(raw, "description")); if (description) out.description = description;
  const datePrecision = str(get(raw, "date_precision.name")); if (datePrecision) out.datePrecision = datePrecision;
  const location = str(get(raw, "location")); if (location) out.location = location;
  const duration = str(get(raw, "duration")); if (duration) out.duration = duration;
  if (featured) out.webcast = featured;
  const image = imageFrom(get(raw, "image")); if (image) out.image = image;
  return out;
}
