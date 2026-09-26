import { mapLaunch } from "../mappers.js";
import type { HttpClient } from "../http.js";
import type { Launch, ListOptions, Paginated, Query } from "../types.js";
import { countdown } from "../utils.js";
import { BaseResource } from "./base.js";

export interface LaunchListOptions extends ListOptions {
  isCrewed?: boolean;
  includeSuborbital?: boolean;
  agencyId?: number;
  rocketId?: number;
  locationIds?: readonly number[];
  statusIds?: readonly number[];
  from?: Date;
  to?: Date;
}

export class LaunchesResource extends BaseResource<Launch> {
  constructor(http: HttpClient) { super(http, "launches"); }
  protected map = mapLaunch;

  private launchQuery(options: LaunchListOptions = {}): Query {
    return {
      ...this.query(options),
      is_crewed: options.isCrewed,
      include_suborbital: options.includeSuborbital,
      lsp__id: options.agencyId,
      launcher_config__id: options.rocketId,
      location__ids: options.locationIds,
      status__ids: options.statusIds,
      net__gte: options.from?.toISOString(),
      net__lte: options.to?.toISOString(),
    };
  }

  override async list(options: LaunchListOptions = {}): Promise<Paginated<Launch>> {
    const raw = await this.http.get<Paginated<unknown>>("launches/", this.launchQuery(options));
    return { ...raw, results: raw.results.map(mapLaunch) };
  }

  async upcoming(options: LaunchListOptions = {}): Promise<Paginated<Launch>> {
    const raw = await this.http.get<Paginated<unknown>>("launches/upcoming/", {
      ordering: "net", hide_recent_previous: true, ...this.launchQuery(options),
    });
    return { ...raw, results: raw.results.map(mapLaunch) };
  }

  async previous(options: LaunchListOptions = {}): Promise<Paginated<Launch>> {
    const raw = await this.http.get<Paginated<unknown>>("launches/previous/", {
      ordering: "-net", ...this.launchQuery(options),
    });
    return { ...raw, results: raw.results.map(mapLaunch) };
  }

  async next(options: Omit<LaunchListOptions, "limit" | "offset"> = {}): Promise<Launch | null> {
    const page = await this.upcoming({ ...options, limit: 1, offset: 0 });
    return page.results[0] ?? null;
  }

  countdown(launch: Launch, now = new Date()) { return countdown(launch.net, now); }
  isLive(launch: Launch, now = new Date(), graceMinutes = 20): boolean {
    const start = launch.windowStart ?? launch.net;
    const end = launch.windowEnd ?? new Date(launch.net.getTime() + graceMinutes * 60_000);
    return now >= start && now <= end && Boolean(launch.webcast);
  }
  hasWebcast(launch: Launch): boolean { return Boolean(launch.webcast ?? launch.videos[0]); }
}
