import type { HttpClient } from "../http.js";
import { mapAstronaut } from "../mappers.js";
import type { Astronaut } from "../types.js";
import { BaseResource } from "./base.js";

export class AstronautsResource extends BaseResource<Astronaut> {
  constructor(http: HttpClient) { super(http, "astronauts"); }
  protected map = mapAstronaut;
}
