import {
  inspectEoProduct, selectEoAssets, type StacItem,
} from "../../src/index.js";

// NETWORK: no. STAC metadata describes EXISTING data, not downloaded pixels.
const item:StacItem={
  type:"Feature",id:"MOCK_2026_S2",collection:"sentinel-2-l2a",
  geometry:null,
  properties:{datetime:"2026-10-01T10:00:00Z","eo:cloud_cover":15},
  assets:{
    B04:{href:"https://example.invalid/B04.tif",roles:["data"],gsd:10,"eo:bands":[{name:"B04"}]},
    B11:{href:"https://example.invalid/B11.tif",roles:["data"],gsd:20,"eo:bands":[{name:"B11"}]},
    SCL:{href:"https://example.invalid/SCL.tif",roles:["data"],gsd:20},
    visual:{href:"https://example.invalid/visual.png",roles:["visual"],type:"image/png"},
  },
};
const product=inspectEoProduct(item);
console.log(product.id,product.availableResolutionsM);
console.table(selectEoAssets(product,"visible"));
console.table(selectEoAssets(product,"mask"));
console.log("Missing thermal:",selectEoAssets(product,"thermal").length===0);
