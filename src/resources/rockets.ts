import type { HttpClient } from "../http.js";
import { mapRocket } from "../mappers.js";
import type { Rocket } from "../types.js";
import { BaseResource } from "./base.js";

export class RocketsResource extends BaseResource<Rocket> {
  constructor(http: HttpClient) { super(http, "launcher_configurations"); }
  protected map = mapRocket;
}
