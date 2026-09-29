/**
 * Build advanced LL2 queries
 *
 * Compose Django-style filters without losing access to new LL2 filter names.
 *
 * Uses: OpenLaunch, query, QueryBuilder
 * Network: yes
 */
import { OpenLaunch, query } from "../../src/index.js";

const space = new OpenLaunch();
const filters = query()
  .dateGte("net", new Date())
  .icontains("rocket__configuration__name", "Falcon")
  .ordering("net")
  .limit(10)
  .build();

const raw = await space.raw("launches/", filters);
console.log(raw);
