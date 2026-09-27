import { OpenLaunch, query } from "../src/index.js";

const sdk = new OpenLaunch();
const filters = query()
  .gte("net", new Date().toISOString())
  .icontains("rocket__configuration__name", "Falcon")
  .ordering("net")
  .limit(20)
  .build();

console.log(await sdk.raw("launches/", filters));
