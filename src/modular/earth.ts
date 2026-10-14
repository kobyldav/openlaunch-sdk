import { earthLayerCatalog, nasaGibsTileTemplate, issLiveSource, fetchFirmsHotspots } from "../intelligence/layers.js";
import { CopernicusClient, type CopernicusOptions } from "../providers/copernicus.js";
import { PlanetaryComputerClient, type PlanetaryComputerOptions } from "../providers/planetary-computer.js";
import { OpenMeteoClient, type OpenMeteoOptions } from "../providers/openmeteo.js";
import { ObservationDiscoveryClient, type ObservationDiscoveryOptions, type ObservationDiscoveryReport } from "../intelligence/observations.js";
import { downloadEoAsset, downloadEoPreview, type EoDownloadOptions, type EoAssetDownload } from "../eo/download.js";
import { inspectEoProduct, type EoAssetInfo, type EoProduct } from "../eo/products.js";
import type { StacItem } from "../providers/stac.js";

/**
 * Lean entrypoint for STAC and Earth Observation discovery.
 * Does not import raster decoders or satellite.js.
 *
 * For georeferenced TIFF/COG pixels, install @openlaunch/raster separately.
 */
export interface EarthCatalogOptions {
  copernicus?: CopernicusOptions;
  planetaryComputer?: PlanetaryComputerOptions;
  weather?: OpenMeteoOptions;
}
export class EarthCatalogClient {
  readonly copernicus: CopernicusClient;
  readonly planetaryComputer: PlanetaryComputerClient;
  readonly weather: OpenMeteoClient;
  readonly observations: ObservationDiscoveryClient;

  constructor(options: EarthCatalogOptions = {}) {
    this.copernicus = new CopernicusClient(options.copernicus);
    this.planetaryComputer = new PlanetaryComputerClient(options.planetaryComputer);
    this.weather = new OpenMeteoClient(options.weather);
    this.observations = new ObservationDiscoveryClient(this.copernicus, this.planetaryComputer);
  }
  readonly layers = { catalog: earthLayerCatalog, nasaTile: nasaGibsTileTemplate, issVideo: issLiveSource, fires: fetchFirmsHotspots };
  discoverObservations(options: ObservationDiscoveryOptions): Promise<ObservationDiscoveryReport> {
    return this.observations.discover(options);
  }
  inspect(item: StacItem): EoProduct { return inspectEoProduct(item); }
  downloadPreview(item: StacItem, options: EoDownloadOptions = {}): Promise<EoAssetDownload> {
    return downloadEoPreview(item, options);
  }
  downloadAsset(asset: EoAssetInfo, options: EoDownloadOptions = {}): Promise<EoAssetDownload> {
    return downloadEoAsset(asset, options);
  }
}
