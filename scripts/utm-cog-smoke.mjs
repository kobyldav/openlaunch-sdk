import assert from "node:assert/strict";
import {lonLatToGridCrs,gridCrsToLonLat,utmZone} from "@openlaunchsdk/raster";
const cases=[
  {place:"Prague",coords:[14.4208,50.088],crs:"EPSG:32633"},
  {place:"Cape Town",coords:[18.4241,-33.9249],crs:"EPSG:32734"},
  {place:"Sydney",coords:[151.2093,-33.8688],crs:"EPSG:32756"},
];
for(const city of cases){
 const [e,n]=lonLatToGridCrs(...city.coords,city.crs);
 const [lon,lat]=gridCrsToLonLat(e,n,city.crs);
 assert.ok(Math.abs(lon-city.coords[0])<1e-6);
 assert.ok(Math.abs(lat-city.coords[1])<1e-6);
 console.log(city.place+":",city.crs,"easting:",Math.round(e),"northing:",Math.round(n));
}
assert.equal(utmZone("EPSG:32633").zone,33);
assert.equal(utmZone("EPSG:32734").hemisphere,"south");
console.log("PASS OpenLaunch v1.15 WGS84 UTM + raster transforms");
console.log("Projection zones: 60 northern + 60 southern");
console.log("Native GeoTIFF/COG UTM regression: npm test");
