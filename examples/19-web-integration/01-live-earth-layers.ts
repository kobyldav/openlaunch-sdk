import {SpaceMapClient} from "../../src/index.js";
const sdk=new SpaceMapClient();
const layers=sdk.layers("observations");
if(!Array.isArray(layers)||!layers.length)throw Error("Empty layer catalog");
const nasa=sdk.webMapDaily({layer:"nasa-modis-terra",date:"2026-10-17"});
if(nasa.verifiedAcquisition||nasa.delivery!=="unchecked")throw Error("Unsupported live claims");
console.log("PASS Earth layers",layers.length,"NASA day",nasa.requestedDate);
