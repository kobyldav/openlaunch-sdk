import type { HttpClient } from "../http.js";
import { mapPad } from "../mappers.js";
import type { LaunchPad } from "../types.js";
import { BaseResource } from "./base.js";

export class PadsResource extends BaseResource<LaunchPad> {
  constructor(http: HttpClient) { super(http, "pads"); }
  protected map = mapPad;
}
