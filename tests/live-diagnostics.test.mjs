import test from "node:test";
import assert from "node:assert/strict";
import {classifyFailure,aggregateDiagnosis,providerForExample} from "../scripts/live-diagnostics.mjs";

test("classifies untrusted upstream signatures without copying secrets",()=>{
 const cases=[
  ["RateLimitError: rate limit exceeded", "quota_or_rate_limited"],
  ["HTTP 429 Too Many Requests", "quota_or_rate_limited"],
  ["API rate limit exceeded with status 403", "quota_or_rate_limited"],
  ["HTTP 401 Unauthorized", "credentials_or_permissions"],
  ["status: 503 Service Unavailable", "provider_server_failure"],
  ["HttpError status=404", "provider_not_found"],
  ["TimeoutError: request deadline", "timeout"],
  ["TypeError: fetch failed", "network_or_dns"],
  ["AssertionError: unexpected data", "sdk_or_example_exception"],
  ["Unrecognized upstream failure", "unclassified_needs_log_review"]
 ];
 for(const [log,expected] of cases)
  assert.equal(classifyFailure({path:"02-nasa/01-neows-feed.ts",log}).category,expected,log);
 const secret="my-secret-ABCD12345";
 assert.equal(JSON.stringify(classifyFailure({path:"02-nasa/01-neows-feed.ts",log:"HTTP 403 "+secret})).includes(secret),false);
 assert.equal(classifyFailure({path:"foo",timedOut:true}).category,"harness_deadline_exceeded");
 assert.equal(classifyFailure({path:"foo",log:"TimeoutError: request deadline"}).category,"timeout");
});
test("aggregated diagnosis does not make one API failure look like multiple SDK bugs",()=>{
 const items=[
  {path:"00-getting-started/01-next-launch.ts",status:"FAIL",log:"first.log",diagnosis:classifyFailure({path:"00-getting-started/01-next-launch.ts",log:"HTTP 429"})},
  {path:"02-nasa/02-neows-browse.ts",status:"FAIL",log:"nasa.log",diagnosis:classifyFailure({path:"02-nasa/02-neows-browse.ts",log:"HTTP 403"})},
  {path:"03-celestrak/01-iss-by-catalog.ts",status:"PASS"}
 ];
 const result=aggregateDiagnosis(items);
 assert.equal(result.failedCount,2);
 assert.equal(result.causes.quota_or_rate_limited,1);
 assert.equal(result.causes.credentials_or_permissions,1);
 assert.equal(result.providers.launch_library_or_combined.failed,1);
 assert.equal(result.providers.nasa_open_apis.failed,1);
 assert.equal(providerForExample("14-orbit-traffic/06-nearest-objects.ts"),"orbit_or_celestrak");
 assert.ok(!JSON.stringify(result).includes("Bearer"));
});
