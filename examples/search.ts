import { OpenLaunch, DEVELOPMENT_BASE_URL } from "../src/index";

const space = new OpenLaunch({ baseUrl: DEVELOPMENT_BASE_URL });
const launches = await space.launches.search("Starlink", { limit: 5 });
for (const launch of launches.results) console.log(launch.net.toISOString(), launch.name);
