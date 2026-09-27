import type { Query, QueryPrimitive, ResponseMode } from "./types.js";

/** Fluent builder for LL2/Django-style filters. It deliberately preserves raw filter names so new API filters work without SDK releases. */
export class QueryBuilder {
  private readonly value: Query = {};
  eq(field: string, value: QueryPrimitive): this { this.value[field] = value; return this; }
  gt(field: string, value: QueryPrimitive): this { this.value[`${field}__gt`] = value; return this; }
  gte(field: string, value: QueryPrimitive): this { this.value[`${field}__gte`] = value; return this; }
  lt(field: string, value: QueryPrimitive): this { this.value[`${field}__lt`] = value; return this; }
  lte(field: string, value: QueryPrimitive): this { this.value[`${field}__lte`] = value; return this; }
  contains(field: string, value: QueryPrimitive): this { this.value[`${field}__contains`] = value; return this; }
  icontains(field: string, value: QueryPrimitive): this { this.value[`${field}__icontains`] = value; return this; }
  ids(field: string, values: readonly QueryPrimitive[]): this { this.value[`${field}__ids`] = values; return this; }
  dateGte(field: string, value: Date): this { this.value[`${field}__gte`] = value.toISOString(); return this; }
  dateLte(field: string, value: Date): this { this.value[`${field}__lte`] = value.toISOString(); return this; }
  search(text: string): this { this.value.search = text; return this; }
  ordering(...fields: string[]): this { this.value.ordering = fields.join(","); return this; }
  limit(value: number): this { this.value.limit = value; return this; }
  offset(value: number): this { this.value.offset = value; return this; }
  mode(value: ResponseMode): this { this.value.mode = value; return this; }
  set(field: string, value: Query["x"]): this { this.value[field] = value; return this; }
  merge(query: Query): this { Object.assign(this.value, query); return this; }
  build(): Query { return { ...this.value }; }
}
export const query = (): QueryBuilder => new QueryBuilder();
