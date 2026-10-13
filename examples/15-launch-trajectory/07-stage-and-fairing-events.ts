import { simulateLaunch } from "../../src/index.js";
import { genericLaunchModel } from "./00-model.js";

const result = simulateLaunch(genericLaunchModel);
for (const event of result.events) {
  console.log(
    event.kind,
    "T+" + event.elapsedSeconds.toFixed(2) + "s",
    "alt=" + event.altitudeKm.toFixed(1) + "km",
    "mass=" + event.massKg.toFixed(1) + "kg",
    event.detail ?? "",
  );
}
