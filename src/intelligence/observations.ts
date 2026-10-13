import type { AreaOfInterest } from "../geo/types.js";
import { inspectEoProduct, type EoProduct } from "../eo/products.js";
import type { StacItem } from "../providers/stac.js";
import { CopernicusClient } from "../providers/copernicus.js";
import { PLANETARY_COMPUTER_COLLECTIONS, PlanetaryComputerClient } from "../providers/planetary-computer.js";
import { sceneDatetime } from "../eo/scenes.js";

export type ObservationLayer = "optical" | "radar" | "thermal" | "elevation";
export type ObservationProvider = "copernicus" | "planetary-computer";
export interface ObservationDiscoveryOptions {
  area: AreaOfInterest;
  from: Date;
  to: Date;
  layers?: readonly ObservationLayer[];
  perQueryLimit?: number;
  maxCloudCoverPercent?: number;
}
export interface ObservationScene {
  provider: ObservationProvider;
  layer: ObservationLayer;
  item: StacItem;
  product: EoProduct;
}
export interface ObservationQueryStatus {
  provider: ObservationProvider;
  layer: ObservationLayer;
  collection: string;
  status: "ok" | "error";
  returned: number;
  excludedWithoutRequiredAsset?: number;
  message?: string;
}
export interface ObservationDiscoveryReport {
  from: Date;
  to: Date;
  scenes: ObservationScene[];
  newestByLayer: Partial<Record<ObservationLayer, ObservationScene>>;
  queryStatuses: ObservationQueryStatus[];
  warnings: string[];
  catalogOnly: true;
}

interface SourceQuery {
  provider: ObservationProvider;
  layer: ObservationLayer;
  collection: string;
}

const COLLECTIONS: Record<ObservationLayer, SourceQuery> = {
  optical: { provider: "copernicus", layer: "optical", collection: "sentinel-2-l2a" },
  radar: { provider: "copernicus", layer: "radar", collection: "sentinel-1-grd" },
  thermal: { provider: "planetary-computer", layer: "thermal", collection: PLANETARY_COMPUTER_COLLECTIONS.landsatC2L2 },
  elevation: { provider: "planetary-computer", layer: "elevation", collection: "cop-dem-glo-30" },
};

export class ObservationDiscoveryClient {
  constructor(
    readonly copernicus: CopernicusClient,
    readonly planetaryComputer: PlanetaryComputerClient,
  ) {}

  /**
   * Each query fails independently; an outage never becomes a fabricated empty search.
   * Thermal refers to available Landsat L2 ST assets (if provided for that item).
   * Elevation is an external DEM catalog product, not satellite 3D reconstruction.
   */
  async discover(options: ObservationDiscoveryOptions): Promise<ObservationDiscoveryReport> {
    const from = new Date(options.from);
    const to = new Date(options.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from)
      throw new RangeError("Observation interval requires valid from <= to");
    const limit = options.perQueryLimit ?? 15;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("perQueryLimit must be an integer in [1, 100]");
    const maxCloud = options.maxCloudCoverPercent;
    if (maxCloud !== undefined && (!Number.isFinite(maxCloud) || maxCloud < 0 || maxCloud > 100))
      throw new RangeError("maxCloudCoverPercent must be in [0,100]");

    const layers: ObservationLayer[] = [...new Set<ObservationLayer>(options.layers ?? ["optical", "radar", "thermal", "elevation"])];
    for (const layer of layers) if (!(layer in COLLECTIONS)) throw new RangeError("Unknown observation layer: " + layer);

    const settled = await Promise.all(layers.map(async layer => {
      const query = COLLECTIONS[layer]!;
      try {
        const client = query.provider === "copernicus" ? this.copernicus.stac : this.planetaryComputer.stac;
        const result = await client.search({
          collections: [query.collection],
          intersects: options.area.geometry,
          ...(layer === "elevation" ? {} : { datetime: { from, to } }),
          limit,
          sortby: [{ field: "properties.datetime", direction: "desc" }],
          ...(maxCloud !== undefined && layer === "optical" ? { query: { "eo:cloud_cover": { lte: maxCloud } } } : {}),
        });
        const categorized: ObservationScene[] = result.features.map(item => ({
          provider: query.provider,
          layer,
          item,
          product: inspectEoProduct(item),
        }));
        const scenes = layer === "thermal"
          ? categorized.filter(scene => scene.product.availableKinds.includes("thermal"))
          : categorized;
        const excludedWithoutRequiredAsset = categorized.length - scenes.length;
        return {
          status: {
            ...query,
            status: "ok" as const,
            returned: scenes.length,
            ...(excludedWithoutRequiredAsset ? { excludedWithoutRequiredAsset } : {}),
          },
          scenes,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: { ...query, status: "error" as const, returned: 0, message: message.slice(0, 300) },
          scenes: [] as ObservationScene[],
        };
      }
    }));
    const scenes = settled.flatMap(entry => entry.scenes).sort((a, b) =>
      (sceneDatetime(b.item)?.getTime() ?? -Infinity) - (sceneDatetime(a.item)?.getTime() ?? -Infinity)
    );
    const newestByLayer: Partial<Record<ObservationLayer, ObservationScene>> = {};
    for (const scene of scenes) if (!newestByLayer[scene.layer]) newestByLayer[scene.layer] = scene;

    const statuses = settled.map(entry => entry.status);
    const warnings = [
      "Catalog records are not image pixel arrays; use declared asset hrefs and a suitable COG/GeoTIFF processor or provider Process API.",
      "Resolution comes from explicit STAC metadata only. A rendered preview is not full-resolution data.",
      "Scene-level cloud estimates do not prove that a selected AOI is clear.",
      "Elevation is a static DEM product and its acquisition date does not match an optical observation date.",
      "A catalog intersection does not establish that satellite imaging was commanded or that pixels are available for every target point.",
    ];
    if (statuses.some(status => status.status === "error")) warnings.push("One or more provider queries failed; results are partial, not an exhaustive inventory.");
    return { from, to, scenes, newestByLayer, queryStatuses: statuses, warnings, catalogOnly: true };
  }
}
