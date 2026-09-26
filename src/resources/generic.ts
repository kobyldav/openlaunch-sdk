import type { HttpClient } from "../http.js";
import type { GenericEntity } from "../types.js";
import { id, imageFrom, str, get } from "../utils.js";
import { ParseError } from "../errors.js";
import { BaseResource } from "./base.js";

function mapper(raw: unknown): GenericEntity {
  const entityId = id(get(raw, "id"));
  const name = str(get(raw, "name"));
  if (entityId === undefined || !name) throw new ParseError("Generic entity requires id and name", raw);
  const out: GenericEntity = { id: entityId, name, source: { provider: "launch-library-2", id: entityId } };
  const url = str(get(raw, "url")); if (url) out.source.url = url;
  const description = str(get(raw, "description")); if (description) out.description = description;
  const image = imageFrom(get(raw, "image")); if (image) out.image = image;
  return out;
}

export class GenericResource extends BaseResource<GenericEntity> {
  constructor(http: HttpClient, endpoint: string) { super(http, endpoint); }
  protected map = mapper;
}
