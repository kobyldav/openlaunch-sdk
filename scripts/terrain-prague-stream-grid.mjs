/** Bounded spatial plan for the lazy Prague 3D server, not a synthetic map.
 * All data returned by a tile request comes from OpenLaunch SDK + ČÚZK.
 */
export const PRAGUE_STREAM_REGION=Object.freeze({
  west:14.400,south:50.076,east:14.454,north:50.112,
  columns:6,rows:6,centerLatitudeDeg:50.094,
});
export const PRAGUE_STREAM_LEVELS=Object.freeze([
  Object.freeze({z:0,multiplier:1,demResolutionM:12,textureResolutionM:2,
    label:"12 m overview / 2 m ortho"}),
  Object.freeze({z:1,multiplier:2,demResolutionM:2,textureResolutionM:.5,
    label:"2 m detailed DSM / 0.5 m ortho"})
]);
const EARTH_RADIUS_M=6378137;
export function mercatorFromLonLat(lon,lat){
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>85)
    throw new RangeError("Invalid Web Mercator location");
  return [EARTH_RADIUS_M*lon*Math.PI/180,
    EARTH_RADIUS_M*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
}
export function tileSpec(z,x,y) {
  if(!Number.isInteger(z)||z<0||z>=PRAGUE_STREAM_LEVELS.length)
    throw new RangeError("Unknown terrain tile level");
  const level=PRAGUE_STREAM_LEVELS[z];
  const cols=PRAGUE_STREAM_REGION.columns*level.multiplier;
  const rows=PRAGUE_STREAM_REGION.rows*level.multiplier;
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=cols||y<0||y>=rows)
    throw new RangeError("Tile outside configured Prague coverage");
  const r=PRAGUE_STREAM_REGION;
  const width=(r.east-r.west)/cols,height=(r.north-r.south)/rows;
  const west=r.west+x*width,east=r.west+(x+1)*width;
  const north=r.north-y*height,south=r.north-(y+1)*height;
  return {z,x,y,columns:cols,rows,west,south,east,north,
    demResolutionM:level.demResolutionM,
    textureResolutionM:level.textureResolutionM,
    key:z+"-"+x+"-"+y};
}
/** Positions in elevationToLocalMesh are relative to raster pixel (0,0), not bbox centre.
 * Anchor each independent tile to one shared Mercator origin before combining.
 */
export function tileOriginOffset(grid,region=PRAGUE_STREAM_REGION) {
  const t=grid.transform;
  if(grid.crs!=="EPSG:3857"||!t||t.length!==6||t[2]!==0||t[4]!==0)
    throw new RangeError("Expected north-up EPSG:3857 height grid");
  const [cx,cy]=mercatorFromLonLat((region.west+region.east)/2,(region.south+region.north)/2);
  const scale=Math.cos(region.centerLatitudeDeg*Math.PI/180);
  const x=(t[0]+t[1]*.5-cx)*scale;
  const north=(t[3]+t[5]*.5-cy)*scale;
  if(!Number.isFinite(x)||!Number.isFinite(north))throw new RangeError("Invalid tile origin");
  return [x,north];
}
export function pragueStreamManifest() {
  const r=PRAGUE_STREAM_REGION;
  return {status:"real-remote-data",bounds:[r.west,r.south,r.east,r.north],
    center:[(r.west+r.east)/2,(r.south+r.north)/2],
    centerLatitudeDeg:r.centerLatitudeDeg,
    levels:PRAGUE_STREAM_LEVELS.map(l=>({...l,cols:r.columns*l.multiplier,
      rows:r.rows*l.multiplier})),
    sources:{elevation:"ČÚZK DMP OK 0.5 m native, Bpv",
      imagery:"ČÚZK Ortofoto ČR 0.125 m native, CC BY 4.0"},
    caveat:"2.5D measured surface, no vertical facades or fabricated terrain"};
}
