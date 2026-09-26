import type { HttpClient } from "../http.js";
import { mapAgency } from "../mappers.js";
import type { Agency } from "../types.js";
import { BaseResource } from "./base.js";

export class AgenciesResource extends BaseResource<Agency> {
  constructor(http: HttpClient) { super(http, "agencies"); }
  protected map = mapAgency;
}
