import { OpenLaunch, launchToCzml } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

const result = new OpenLaunch().trajectory.simulate(genericLaunchModel);
const czml = launchToCzml(result, { id: "demo", includeEvents: true });
console.log(JSON.stringify(czml, null, 2));
