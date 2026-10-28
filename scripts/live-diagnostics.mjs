/**
 * Offline-first diagnosis of live cookbook failures.
 * We classify log signatures, never claim to prove the root cause.
 * No log contents, URLs, keys, or upstream response bodies are copied to reports.
 */
const rule = (name, test) => ({name,test});
const rules=[
 rule("quota_or_rate_limited",/(?:RateLimitError|Too Many Requests|rate[\s-]*limit(?: exceeded| reached)?|quota[\s-]*(?:exceeded|reached)|(?:HTTP|status|statusCode|code)[\s:=]*(?:429)\b|\b429 Too Many Requests\b)/i),
 rule("credentials_or_permissions",/(?:invalid[\s_-]*(?:api[\s_-]*key|token|credentials)|missing[\s_-]*(?:api[\s_-]*key|credentials)|authentication(?: failed|required)|unauthori[sz]ed|(?:HTTP|status|statusCode|code)[\s:=]*(?:401|403)\b|\b(?:401|403) (?:Unauthorized|Forbidden)\b)/i),
 rule("provider_server_failure",/(?:\b(?:HTTP|status|statusCode|code)[\s:=]*(?:500|502|503|504)\b|\b(?:500|502|503|504) (?:Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)\b)/i),
 rule("provider_not_found",/(?:\b(?:HTTP|status|statusCode|code)[\s:=]*404\b|\b404 Not Found\b)/i),
 rule("timeout",/(?:TimeoutError|timed?\s*out|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|AbortError)/i),
 rule("network_or_dns",/(?:fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|CERT_HAS_EXPIRED|TLS handshake|ENETUNREACH)/i),
 rule("sdk_or_example_exception",/(?:AssertionError|TypeError|ReferenceError|SyntaxError|RangeError|ERR_MODULE_NOT_FOUND|is not a function|Cannot read properties|Assertion failed)/i)
];
export function providerForExample(path){
 if(/^(?:00-getting-started|01-launch-library|11-integrated-missions|12-sdk-infrastructure)\//.test(path)
    || /^(?:mars-mission|next-launch|query-builder|search)\.ts$/.test(path))
    return "launch_library_or_combined";
 if(/^02-nasa\//.test(path))return "nasa_open_apis";
 if(/^03-celestrak\//.test(path)||path==="celestrak.ts")return "celestrak";
 if(/^14-orbit-traffic\//.test(path))return "orbit_or_celestrak";
 if(/^13-earth-observation\//.test(path)||/^16-mission-intelligence\//.test(path)||/^17-raster\//.test(path))
    return "earth_observation_multi_provider";
 if(/^18-live-earth\//.test(path))return "live_earth_multi_provider";
 return "unknown_or_combined";
}
export function classifyFailure({path="",log="",timedOut=false}={}){
 if(timedOut)return {category:"harness_deadline_exceeded",provider:providerForExample(path),confidence:"confirmed_runner_termination"};
 // Avoid mistaking a harmless count in console output for a response status.
 const tail=String(log).slice(-100_000);
 for(const {name,test} of rules){
  if(test.test(tail))return {category:name,provider:providerForExample(path),confidence:"signature_only"};
 }
 return {category:"unclassified_needs_log_review",provider:providerForExample(path),confidence:"unknown"};
}
export function aggregateDiagnosis(entries){
 const causes={},providers={},failed=[];
 for(const item of entries){
  if(item.status!=="FAIL")continue;
  const diagnosis=item.diagnosis??classifyFailure({path:item.path});
  causes[diagnosis.category]=(causes[diagnosis.category]??0)+1;
  const group=providers[diagnosis.provider]??={failed:0,causes:{}};
  group.failed++;
  group.causes[diagnosis.category]=(group.causes[diagnosis.category]??0)+1;
  failed.push({path:item.path,log:item.log,diagnosis});
 }
 return {classification:"heuristic_not_root_cause",failedCount:failed.length,causes,providers,failed};
}
