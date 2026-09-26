import type { HttpClient } from "../http.js";
import { mapEvent } from "../mappers.js";
import type { ListOptions, Paginated, SpaceEvent } from "../types.js";
import { BaseResource } from "./base.js";

export class EventsResource extends BaseResource<SpaceEvent> {
  constructor(http: HttpClient) { super(http, "events"); }
  protected map = mapEvent;

  async upcoming(options: ListOptions = {}): Promise<Paginated<SpaceEvent>> {
    const raw = await this.http.get<Paginated<unknown>>("events/upcoming/", { ordering: "date", ...this.query(options) });
    return { ...raw, results: raw.results.map(mapEvent) };
  }
  async previous(options: ListOptions = {}): Promise<Paginated<SpaceEvent>> {
    const raw = await this.http.get<Paginated<unknown>>("events/previous/", { ordering: "-date", ...this.query(options) });
    return { ...raw, results: raw.results.map(mapEvent) };
  }
}
