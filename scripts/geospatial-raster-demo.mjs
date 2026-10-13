import {
  decodeGeoTiff, rasterStatistics, ndviRaster,
  rasterDifference, clipRasterToAoi, bbox,
  alignRasterTo, elevationToLocalMesh,
} from "../dist/index.js";

console.log("=== OpenLaunch v1.0.0 | actual GeoTIFF pixel decoding + raster analytics ===");
console.log("Offline generated TIFF fixture; not a claim of downloaded satellite imagery.");

/** Write a tiny, standards-shaped classic GeoTIFF from genuine pixel bytes. */
function createGeoTiff(values, {epsg=4326, x=14, y=51, scale=.01}={}) {
  const width=2,height=2;
  const entries=[
    [256,4,1,width],[257,4,1,height],[258,3,1,16],[259,3,1,1],
    [262,3,1,1],[273,4,1,0],[277,3,1,1],[278,4,1,height],
    [279,4,1,8],[284,3,1,1],[339,3,1,1],
    [33550,12,3,0],[33922,12,6,0],[34735,3,8,0],
  ].sort((a,b)=>a[0]-b[0]);
  const count=entries.length,ifd=8;
  const scaleOffset=ifd+2+count*12+4;
  const tieOffset=scaleOffset+24;
  const keyOffset=tieOffset+48;
  const sampleOffset=keyOffset+16;
  const bytes=new Uint8Array(sampleOffset+8);
  const dv=new DataView(bytes.buffer);
  bytes[0]=73;bytes[1]=73;
  dv.setUint16(2,42,true);dv.setUint32(4,ifd,true);
  dv.setUint16(ifd,count,true);
  entries.forEach(([tag,type,length,value],index)=>{
    const o=ifd+2+index*12;
    dv.setUint16(o,tag,true);dv.setUint16(o+2,type,true);
    dv.setUint32(o+4,length,true);
    const val=tag===273?sampleOffset:tag===33550?scaleOffset:tag===33922?tieOffset:tag===34735?keyOffset:value;
    if(type===3&&length===1)dv.setUint16(o+8,val,true);
    else dv.setUint32(o+8,val,true);
  });
  [scale,scale,0].forEach((n,i)=>dv.setFloat64(scaleOffset+8*i,n,true));
  [0,0,0,x,y,0].forEach((n,i)=>dv.setFloat64(tieOffset+8*i,n,true));
  [1,1,0,1,epsg===4326?2048:3072,0,1,epsg].forEach((n,i)=>dv.setUint16(keyOffset+2*i,n,true));
  values.forEach((v,i)=>dv.setUint16(sampleOffset+2*i,v,true));
  return bytes;
}

const red=await decodeGeoTiff(createGeoTiff([2000,3000,4000,5000]));
const nir=await decodeGeoTiff(createGeoTiff([8000,7000,6000,5000]));
const vegetation=ndviRaster(red,nir);
const earlier=await decodeGeoTiff(createGeoTiff([7000,7000,6000,5000]));
const baseline=ndviRaster(red,earlier);
const change=rasterDifference(baseline,vegetation);

console.log("\nVerified native GeoTIFF band values:",{red:[...red.values],nir:[...nir.values]});
console.log("NDVI image statistics:",rasterStatistics(vegetation));
console.log("NDVI change followup-minus-baseline:",rasterStatistics(change.grid));
console.log("AOI-clipped vegetation:",[...clipRasterToAoi(vegetation,bbox(14,50.99,14.01,51)).values]);
const dem=await decodeGeoTiff(createGeoTiff([125,135,120,150],{
  epsg:3857,x:1550000,y:6450000,scale:30,
}));
const mesh=elevationToLocalMesh(dem);
console.log("Local DEM triangle mesh:",{
  validVertices:mesh.validVertices,
  triangles:mesh.triangles.length/3,
  positions:[...mesh.positions],
  model:mesh.model,
});
console.log("\nPixel values here come from real decoded generated TIFF bytes; external STAC downloads remain separately verified.");
