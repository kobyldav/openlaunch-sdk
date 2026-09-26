"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapAgency = mapAgency;
exports.mapRocket = mapRocket;
exports.mapPad = mapPad;
exports.mapLaunch = mapLaunch;
exports.mapAstronaut = mapAstronaut;
exports.mapEvent = mapEvent;
const errors_js_1 = require("./errors.js");
const utils_js_1 = require("./utils.js");
function requiredId(raw) {
    const value = (0, utils_js_1.id)((0, utils_js_1.get)(raw, "id"));
    if (value === undefined)
        throw new errors_js_1.ParseError("Entity is missing id", raw);
    return value;
}
function requiredName(raw) {
    const value = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "name"));
    if (!value)
        throw new errors_js_1.ParseError("Entity is missing name", raw);
    return value;
}
function source(raw) {
    const result = {
        provider: "launch-library-2",
        id: requiredId(raw),
    };
    const url = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "url"));
    if (url)
        result.url = url;
    return result;
}
function country(raw) {
    const object = (0, utils_js_1.isRecord)(raw) ? raw : undefined;
    if (!object)
        return undefined;
    const name = (0, utils_js_1.str)(object.name);
    if (!name)
        return undefined;
    const out = { name };
    const code = (0, utils_js_1.str)(object.alpha_2_code) ?? (0, utils_js_1.str)(object.code);
    if (code)
        out.code = code;
    return out;
}
function status(raw) {
    if (!(0, utils_js_1.isRecord)(raw))
        return { name: "Unknown" };
    const out = { name: (0, utils_js_1.str)(raw.name) ?? "Unknown" };
    const statusId = (0, utils_js_1.id)(raw.id);
    if (statusId !== undefined)
        out.id = statusId;
    const abbreviation = (0, utils_js_1.str)(raw.abbrev);
    if (abbreviation)
        out.abbreviation = abbreviation;
    const description = (0, utils_js_1.str)(raw.description);
    if (description)
        out.description = description;
    return out;
}
function mapAgency(raw) {
    const out = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
    const abbreviation = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "abbrev"));
    if (abbreviation)
        out.abbreviation = abbreviation;
    const type = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "type.name")) ?? (0, utils_js_1.str)((0, utils_js_1.get)(raw, "type"));
    if (type)
        out.type = type;
    const c = country((0, utils_js_1.get)(raw, "country"));
    if (c)
        out.country = c;
    const administrator = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "administrator"));
    if (administrator)
        out.administrator = administrator;
    const foundingYear = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "founding_year"));
    if (foundingYear !== undefined)
        out.foundingYear = foundingYear;
    const description = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "description"));
    if (description)
        out.description = description;
    const website = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "url")) ?? (0, utils_js_1.str)((0, utils_js_1.get)(raw, "website"));
    if (website)
        out.website = website;
    const wikiUrl = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "wiki_url"));
    if (wikiUrl)
        out.wikiUrl = wikiUrl;
    const logo = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "logo"));
    if (logo)
        out.logo = logo;
    const image = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "image"));
    if (image)
        out.image = image;
    return out;
}
function mapRocket(raw) {
    const out = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
    const fullName = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "full_name"));
    if (fullName)
        out.fullName = fullName;
    if ((0, utils_js_1.isRecord)((0, utils_js_1.get)(raw, "manufacturer")))
        out.manufacturer = mapAgency((0, utils_js_1.get)(raw, "manufacturer"));
    const active = (0, utils_js_1.bool)((0, utils_js_1.get)(raw, "active"));
    if (active !== undefined)
        out.active = active;
    const reusable = (0, utils_js_1.bool)((0, utils_js_1.get)(raw, "reusable"));
    if (reusable !== undefined)
        out.reusable = reusable;
    const maidenFlight = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "maiden_flight"));
    if (maidenFlight)
        out.maidenFlight = maidenFlight;
    const lengthMeters = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "length"));
    if (lengthMeters !== undefined)
        out.lengthMeters = lengthMeters;
    const diameterMeters = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "diameter"));
    if (diameterMeters !== undefined)
        out.diameterMeters = diameterMeters;
    const launchMassKg = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "launch_mass"));
    if (launchMassKg !== undefined)
        out.launchMassKg = launchMassKg;
    const leoCapacityKg = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "leo_capacity"));
    if (leoCapacityKg !== undefined)
        out.leoCapacityKg = leoCapacityKg;
    const gtoCapacityKg = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "gto_capacity"));
    if (gtoCapacityKg !== undefined)
        out.gtoCapacityKg = gtoCapacityKg;
    const successfulLaunches = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "successful_launches"));
    if (successfulLaunches !== undefined)
        out.successfulLaunches = successfulLaunches;
    const failedLaunches = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "failed_launches"));
    if (failedLaunches !== undefined)
        out.failedLaunches = failedLaunches;
    const totalLaunches = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "total_launch_count"));
    if (totalLaunches !== undefined)
        out.totalLaunches = totalLaunches;
    const description = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "description"));
    if (description)
        out.description = description;
    const wikiUrl = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "wiki_url"));
    if (wikiUrl)
        out.wikiUrl = wikiUrl;
    const infoUrl = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "info_url"));
    if (infoUrl)
        out.infoUrl = infoUrl;
    const image = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "image"));
    if (image)
        out.image = image;
    return out;
}
function mapPad(raw) {
    const out = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
    const location = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "location.name"));
    if (location)
        out.location = location;
    const c = country((0, utils_js_1.get)(raw, "country")) ?? country((0, utils_js_1.get)(raw, "location.country"));
    if (c)
        out.country = c;
    const latitude = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "latitude"));
    if (latitude !== undefined)
        out.latitude = latitude;
    const longitude = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "longitude"));
    if (longitude !== undefined)
        out.longitude = longitude;
    const active = (0, utils_js_1.bool)((0, utils_js_1.get)(raw, "active"));
    if (active !== undefined)
        out.active = active;
    const description = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "description"));
    if (description)
        out.description = description;
    const mapUrl = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "map_url"));
    if (mapUrl)
        out.mapUrl = mapUrl;
    const wikiUrl = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "wiki_url"));
    if (wikiUrl)
        out.wikiUrl = wikiUrl;
    const image = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "image"));
    if (image)
        out.image = image;
    return out;
}
function mapMission(raw) {
    if (!(0, utils_js_1.isRecord)(raw))
        return undefined;
    const out = {};
    const missionId = (0, utils_js_1.id)(raw.id);
    if (missionId !== undefined)
        out.id = missionId;
    const name = (0, utils_js_1.str)(raw.name);
    if (name)
        out.name = name;
    const description = (0, utils_js_1.str)(raw.description);
    if (description)
        out.description = description;
    const type = (0, utils_js_1.str)(raw.type);
    if (type)
        out.type = type;
    const orbitName = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "orbit.name"));
    if (orbitName) {
        out.orbit = { name: orbitName };
        const abbreviation = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "orbit.abbrev"));
        if (abbreviation)
            out.orbit.abbreviation = abbreviation;
    }
    return Object.keys(out).length ? out : undefined;
}
function mapLaunch(raw) {
    const net = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "net"));
    if (!net)
        throw new errors_js_1.ParseError("Launch is missing a valid NET date", raw);
    const allVideos = [
        ...(0, utils_js_1.videosFrom)((0, utils_js_1.get)(raw, "vid_urls")),
        ...(0, utils_js_1.videosFrom)((0, utils_js_1.get)(raw, "videos")),
    ];
    const directVideo = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "vidURLs.0.url")) ?? (0, utils_js_1.str)((0, utils_js_1.get)(raw, "video_url"));
    if (directVideo && !allVideos.some((v) => v.url === directVideo))
        allVideos.push({ url: directVideo });
    const featured = allVideos.find((v) => v.featured) ?? allVideos[0];
    const out = {
        id: requiredId(raw), name: requiredName(raw), status: status((0, utils_js_1.get)(raw, "status")), net,
        videos: allVideos, source: source(raw),
    };
    const slug = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "slug"));
    if (slug)
        out.slug = slug;
    const designator = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "launch_designator"));
    if (designator)
        out.designator = designator;
    const windowStart = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "window_start"));
    if (windowStart)
        out.windowStart = windowStart;
    const windowEnd = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "window_end"));
    if (windowEnd)
        out.windowEnd = windowEnd;
    const lastUpdated = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "last_updated"));
    if (lastUpdated)
        out.lastUpdated = lastUpdated;
    const probability = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "probability"));
    if (probability !== undefined)
        out.probability = probability;
    const holdReason = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "holdreason")) ?? (0, utils_js_1.str)((0, utils_js_1.get)(raw, "hold_reason"));
    if (holdReason)
        out.holdReason = holdReason;
    const failReason = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "failreason")) ?? (0, utils_js_1.str)((0, utils_js_1.get)(raw, "fail_reason"));
    if (failReason)
        out.failReason = failReason;
    const hashtag = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "hashtag"));
    if (hashtag)
        out.hashtag = hashtag;
    const rocketRaw = (0, utils_js_1.get)(raw, "rocket.configuration");
    if ((0, utils_js_1.isRecord)(rocketRaw))
        out.rocket = mapRocket(rocketRaw);
    const providerRaw = (0, utils_js_1.get)(raw, "launch_service_provider");
    if ((0, utils_js_1.isRecord)(providerRaw))
        out.provider = mapAgency(providerRaw);
    const padRaw = (0, utils_js_1.get)(raw, "pad");
    if ((0, utils_js_1.isRecord)(padRaw))
        out.pad = mapPad(padRaw);
    const mission = mapMission((0, utils_js_1.get)(raw, "mission"));
    if (mission)
        out.mission = mission;
    if (featured)
        out.webcast = featured;
    const image = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "image"));
    if (image)
        out.image = image;
    return out;
}
function mapAstronaut(raw) {
    const out = { id: requiredId(raw), name: requiredName(raw), source: source(raw) };
    const statusName = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "status.name"));
    if (statusName)
        out.status = statusName;
    const typeName = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "type.name"));
    if (typeName)
        out.type = typeName;
    const agencyRaw = (0, utils_js_1.get)(raw, "agency");
    if ((0, utils_js_1.isRecord)(agencyRaw))
        out.agency = mapAgency(agencyRaw);
    const nationality = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "nationality.0.nationality_name")) ?? (0, utils_js_1.str)((0, utils_js_1.get)(raw, "nationality"));
    if (nationality)
        out.nationality = nationality;
    const bio = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "bio"));
    if (bio)
        out.bio = bio;
    const dob = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "date_of_birth"));
    if (dob)
        out.dateOfBirth = dob;
    const dod = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "date_of_death"));
    if (dod)
        out.dateOfDeath = dod;
    const first = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "first_flight"));
    if (first)
        out.firstFlight = first;
    const last = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "last_flight"));
    if (last)
        out.lastFlight = last;
    const flights = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "flights_count"));
    if (flights !== undefined)
        out.flightsCount = flights;
    const landings = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "landings_count"));
    if (landings !== undefined)
        out.landingsCount = landings;
    const spacewalks = (0, utils_js_1.num)((0, utils_js_1.get)(raw, "spacewalks_count"));
    if (spacewalks !== undefined)
        out.spacewalksCount = spacewalks;
    const tis = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "time_in_space"));
    if (tis)
        out.timeInSpace = tis;
    const eva = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "eva_time"));
    if (eva)
        out.evaTime = eva;
    const inSpace = (0, utils_js_1.bool)((0, utils_js_1.get)(raw, "in_space"));
    if (inSpace !== undefined)
        out.inSpace = inSpace;
    const image = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "image"));
    if (image)
        out.image = image;
    return out;
}
function mapEvent(raw) {
    const eventDate = (0, utils_js_1.date)((0, utils_js_1.get)(raw, "date"));
    if (!eventDate)
        throw new errors_js_1.ParseError("Event is missing a valid date", raw);
    const allVideos = (0, utils_js_1.videosFrom)((0, utils_js_1.get)(raw, "vid_urls"));
    const featured = allVideos.find((v) => v.featured) ?? allVideos[0];
    const out = { id: requiredId(raw), name: requiredName(raw), date: eventDate, videos: allVideos, source: source(raw) };
    const type = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "type.name")) ?? (0, utils_js_1.str)((0, utils_js_1.get)(raw, "type"));
    if (type)
        out.type = type;
    const description = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "description"));
    if (description)
        out.description = description;
    const datePrecision = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "date_precision.name"));
    if (datePrecision)
        out.datePrecision = datePrecision;
    const location = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "location"));
    if (location)
        out.location = location;
    const duration = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "duration"));
    if (duration)
        out.duration = duration;
    if (featured)
        out.webcast = featured;
    const image = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "image"));
    if (image)
        out.image = image;
    return out;
}
//# sourceMappingURL=mappers.js.map