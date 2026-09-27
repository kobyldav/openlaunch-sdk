import test from "node:test";
import assert from "node:assert/strict";
import { query } from "../dist/index.js";

test("fluent query builder produces LL2-style filters", () => {
  const q = query().gte("net", "2030-01-01").icontains("rocket__configuration__name", "Falcon").ordering("net").limit(50).build();
  assert.equal(q.net__gte, "2030-01-01");
  assert.equal(q.rocket__configuration__name__icontains, "Falcon");
  assert.equal(q.ordering, "net");
  assert.equal(q.limit, 50);
});
