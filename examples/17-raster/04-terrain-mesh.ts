import { elevationToLocalMesh,type RasterGrid } from "../../src/index.js";

// NETWORK: no. EPSG:3857 source and heights in metres are explicitly assumed.
const dem:RasterGrid={
  width:3,height:3,crs:"EPSG:3857",
  transform:[1550000,30,0,6450000,0,-30],
  values:new Float64Array([200,210,205,190,NaN,220,195,215,210]),
  unit:"m",source:"illustrative-DEM",
};
const mesh=elevationToLocalMesh(dem,{verticalExaggeration:1});
console.log({
  vertexCount:mesh.validVertices,triangleCount:mesh.triangles.length/3,
  positions:mesh.positions.length,
  coordinateSystem:mesh.model,
});
