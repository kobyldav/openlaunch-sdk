import type { AreaOfInterest } from "../geo/types.js";
import { ObservationDiscoveryClient, type ObservationDiscoveryOptions, type ObservationDiscoveryReport } from "./observations.js";
import { downloadEoPreview, type EoAssetDownload, type EoDownloadOptions } from "../eo/download.js";
import { centerOf } from "../geo/types.js";
import { rankScenes, type SceneScore } from "../eo/scenes.js";
import type { StacFeatureCollection, StacItem } from "../providers/stac.js";
import { CopernicusClient } from "../providers/copernicus.js";
import { OpenMeteoClient, type ObservationWeather, type ObservationWeatherScore } from "../providers/openmeteo.js";
import { PLANETARY_COMPUTER_COLLECTIONS, PlanetaryComputerClient } from "../providers/planetary-computer.js";

export type ObservationSensor = "optical" | "radar";
export type EarthDataSource = "copernicus" | "planetary-computer";

export interface EarthIntelligenceOptions {
  copernicus?: CopernicusClient;
  planetaryComputer?: PlanetaryComputerClient;
  weather?: OpenMeteoClient;
}

export interface ImagerySearchOptions {
  area: AreaOfInterest;
  from: Date | string;
  to: Date | string;
  sensor?: ObservationSensor;
  source?: EarthDataSource;
  maxCloudCoverPercent?: number;
  limit?: number;
  collection?: string;
}

export interface MonitoringSnapshotOptions {
  area: AreaOfInterest;
  lookbackDays?: number;
  maxCloudCoverPercent?: number;
  now?: Date;
}

export interface MonitoringSnapshot {
  area: AreaOfInterest;
  generatedAt: Date;
  weather: ObservationWeather | null;
  optical: SceneScore[];
  radar: StacItem[];
  recommendedSensor: ObservationSensor;
  recommendationReasons: string[];
  provenance: string[];
  limitations: string[];
  sourceFailures?: string[];
}

export class EarthIntelligenceClient {
  readonly copernicus: CopernicusClient;
  readonly planetaryComputer: PlanetaryComputerClient;
  readonly weather: OpenMeteoClient;
  readonly observations: ObservationDiscoveryClient;

  constructor(options: EarthIntelligenceOptions = {}) {
    this.copernicus = options.copernicus ?? new CopernicusClient();
    this.planetaryComputer = options.planetaryComputer ?? new PlanetaryComputerClient();
    this.weather = options.weather ?? new OpenMeteoClient();
    this.observations = new ObservationDiscoveryClient(this.copernicus, this.planetaryComputer);
  }

  downloadPreview(item: StacItem, options: EoDownloadOptions = {}): Promise<EoAssetDownload> {
    return downloadEoPreview(item, options);
  }

  discoverObservations(options: ObservationDiscoveryOptions): Promise<ObservationDiscoveryReport> {
    return this.observations.discover(options);
  }

  async searchImagery(options: ImagerySearchOptions): Promise<StacFeatureCollection> {
    const sensor = options.sensor ?? "optical";
    const source = options.source ?? "copernicus";
    const limit = options.limit ?? 20;

    if (source === "copernicus") {
      if (options.collection) {
        return this.copernicus.stac.search({
          collections: [options.collection],
          intersects: options.area.geometry,
          datetime: { from: options.from, to: options.to },
          limit,
          sortby: [{ field: "properties.datetime", direction: "desc" }],
        });
      }
      return sensor === "radar"
        ? this.copernicus.searchSentinel1(options.area, options.from, options.to, limit)
        : this.copernicus.searchSentinel2(options.area, options.from, options.to, options.maxCloudCoverPercent ?? 30, limit);
    }

    const collection = options.collection ?? (
      sensor === "radar"
        ? PLANETARY_COMPUTER_COLLECTIONS.sentinel1Rtc
        : PLANETARY_COMPUTER_COLLECTIONS.sentinel2L2a
    );
    return this.planetaryComputer.stac.search({
      collections: [collection],
      intersects: options.area.geometry,
      datetime: { from: options.from, to: options.to },
      limit,
      ...(sensor === "optical" ? { query: { "eo:cloud_cover": { lte: options.maxCloudCoverPercent ?? 30 } } } : {}),
      sortby: [{ field: "properties.datetime", direction: "desc" }],
    });
  }

  async searchLandsatHistory(area: AreaOfInterest, from: Date | string, to: Date | string, limit = 50): Promise<StacFeatureCollection> {
    return this.planetaryComputer.stac.search({
      collections: [PLANETARY_COMPUTER_COLLECTIONS.landsatC2L2],
      intersects: area.geometry,
      datetime: { from, to },
      limit,
      sortby: [{ field: "properties.datetime", direction: "desc" }],
    });
  }

  async opticalWeatherWindows(area: AreaOfInterest, options: { forecastDays?: number; maxCloudCoverPercent?: number; limit?: number } = {}): Promise<ObservationWeatherScore[]> {
    const [lon, lat] = centerOf(area);
    return this.weather.bestOpticalWindows(lat, lon, {
      forecastDays: options.forecastDays ?? 7,
      maxCloudCoverPercent: options.maxCloudCoverPercent ?? 30,
      daylightOnly: true,
      limit: options.limit ?? 24,
    });
  }

  async monitoringSnapshot(options: MonitoringSnapshotOptions): Promise<MonitoringSnapshot> {
    const now = options.now ?? new Date();
    const from = new Date(now.getTime() - (options.lookbackDays ?? 30) * 86_400_000);
    const maxCloud = options.maxCloudCoverPercent ?? 25;
    const [lon, lat] = centerOf(options.area);

    const outcomes = await Promise.allSettled([
      this.copernicus.searchSentinel2(options.area, from, now, maxCloud, 30),
      this.copernicus.searchSentinel1(options.area, from, now, 30),
      this.weather.conditionsAt(lat, lon, now, { forecastDays: 1 }),
    ]);
    const sourceNames = ["Copernicus Sentinel-2", "Copernicus Sentinel-1", "Open-Meteo"];
    const sourceFailures = outcomes.flatMap((outcome, index) =>
      outcome.status === "rejected"
        ? [sourceNames[index]! + ": " + (outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)).slice(0, 180)]
        : []
    );
    const opticalRaw = outcomes[0]!.status === "fulfilled" ? outcomes[0]!.value : { features: [] };
    const radarRaw = outcomes[1]!.status === "fulfilled" ? outcomes[1]!.value : { features: [] };
    const weather = outcomes[2]!.status === "fulfilled" ? outcomes[2]!.value : null;
    const optical = rankScenes(opticalRaw.features, { maxCloudCoverPercent: maxCloud, preferRecent: true, now });
    const reasons: string[] = [];
    let recommendedSensor: ObservationSensor = "radar";
    const cloud = weather?.cloudCoverPercent;

    if (cloud !== undefined && cloud > maxCloud) {
      recommendedSensor = "radar";
      reasons.push(`current forecast cloud cover is ${cloud.toFixed(0)}%, above optical threshold ${maxCloud}%`);
    } else if (cloud !== undefined) {
      recommendedSensor = weather?.isDay === false ? "radar" : "optical";
      reasons.push(`current forecast cloud cover is ${cloud.toFixed(0)}%, within optical threshold`);
      if (weather?.isDay === false) reasons.push("nighttime limits passive optical imagery");
    } else {
      reasons.push("current cloud cover is unavailable; radar is the conservative fallback");
    }

    if (optical.length === 0 && radarRaw.features.length > 0) {
      recommendedSensor = "radar";
      reasons.push("no recent optical scene matched the cloud threshold, while radar scenes are available");
    } else if (optical.length > 0) {
      reasons.push("recent optical scenes are available");
    }

    return {
      area: options.area,
      generatedAt: now,
      weather,
      optical,
      radar: radarRaw.features,
      recommendedSensor,
      recommendationReasons: reasons,
      provenance: [
        ...(outcomes[0]!.status === "fulfilled" ? ["Copernicus Data Space STAC: Sentinel-2 L2A"] : []),
        ...(outcomes[1]!.status === "fulfilled" ? ["Copernicus Data Space STAC: Sentinel-1 GRD"] : []),
        ...(outcomes[2]!.status === "fulfilled" ? ["Open-Meteo forecast API"] : []),
      ],
      sourceFailures,
      limitations: [
        "A catalog scene intersecting the AOI does not prove the target itself is cloud-free.",
        "Weather forecast cloud cover is not a substitute for pixel-level cloud masks.",
        "Satellite overpass prediction is intentionally not inferred from simple two-body OMM conversion.",
        "Use validated orbit propagation and acquisition-plan data when timing a future collection matters.",
        ...(sourceFailures.length ? ["Provider failures caused an incomplete monitoring snapshot."] : []),
      ],
    };
  }

  recommendSensor(weather: ObservationWeather | null, maxCloudCoverPercent = 30): { sensor: ObservationSensor; reasons: string[] } {
    if (!weather) return { sensor: "radar", reasons: ["weather unavailable; radar is the conservative all-weather option"] };
    const cloud = weather.cloudCoverPercent;
    if (cloud === undefined) return { sensor: "radar", reasons: ["cloud cover unavailable; radar is the conservative all-weather option"] };
    if (cloud > maxCloudCoverPercent) return { sensor: "radar", reasons: [`cloud cover ${cloud.toFixed(0)}% exceeds ${maxCloudCoverPercent}%`] };
    if (weather.isDay === false) return { sensor: "radar", reasons: ["nighttime limits passive optical imaging"] };
    return { sensor: "optical", reasons: [`cloud cover ${cloud.toFixed(0)}% is within threshold`, "daylight conditions are suitable"] };
  }
}
