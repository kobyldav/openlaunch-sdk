import {pixelToWorld,gridCrsToLonLat,validateRaster,type RasterGrid} from "../eo/raster.js";
import {geodeticToEcef} from "../geo/ellipsoid.js";
import {reconstructTerrain,type TerrainGrid,type TerrainReconstruction} from "./reconstruct.js";
import {estimateTerrainHeightBand} from "./pilot.js";
import {terrainSourceImages,type TerrainSourceOptions} from "./source.js";

export interface TerrainTileProgress {
  completed:number; total:number; col:number; row:number; width:number; height:number;
}
export interface TiledTerrainOptions extends TerrainSourceOptions {
  tileSize?:number;
  /** Halo context (in output pixels) used for regularization across tile boundaries. */
  tileHaloPixels?:number;
  onTile?:(progress:TerrainTileProgress)=>void;
  /** Exclude implausibly steep mesh edges; does NOT remove measured samples. */
  maxAdjacentRiseM?:number;
  /** Derive per-tile image-only search bands; never use a reference DEM. */
  localHeightPilot?:boolean;
}
/** Reconstruct a larger AOI in bounded native tiles and join its measured values
 * without interpolation at tile seams. Camera models and sensor images are reused;
 * each tile has the original global affine pixel geometry.
 * Synchronous by design. Use a worker for browser UI or split calls yourself.
 */
export function reconstructTerrainTiled(o:TiledTerrainOptions):TerrainReconstruction&{sourceKind:"satellite"|"aerial";tiles:number;pilotTiles:number;pilotFallbacks:number}{
  const {source,tileSize=64,tileHaloPixels=0,onTile,maxAdjacentRiseM=Infinity,localHeightPilot=false,...options}=o,{grid}=options;
  if(!Number.isInteger(tileSize)||tileSize<2||tileSize>256)throw new RangeError("Tile size must be 2..256");
  if(!(maxAdjacentRiseM>0))throw new RangeError("maxAdjacentRiseM must be positive");
  if(!Number.isInteger(tileHaloPixels)||tileHaloPixels<0||tileHaloPixels>32||tileSize+2*tileHaloPixels>256)throw new RangeError("Invalid tile halo size");
  const n=grid.width*grid.height;
  if(!Number.isSafeInteger(grid.width)||!Number.isSafeInteger(grid.height)||grid.width<2||grid.height<2||!Number.isSafeInteger(n)||n>1_000_000)throw new RangeError("Tiled grid must contain 4..1,000,000 pixels");
  const countX=Math.ceil(grid.width/tileSize),countY=Math.ceil(grid.height/tileSize),total=countX*countY;
  if(total>4096)throw new RangeError("Too many terrain tiles");
  // Validate upfront, not only when each tile happens to run.
  validateRaster({...grid,values:new Float64Array(n)});
  const images=terrainSourceImages(source);
  const values=new Float64Array(n).fill(NaN),conf=new Float64Array(n).fill(NaN),
    texture=new Float64Array(n).fill(NaN),passes=new Uint8Array(n),rejections=new Uint8Array(n);
  let completed=0,pilotTiles=0,pilotFallbacks=0;
  for(let ty=0;ty<countY;ty++)for(let tx=0;tx<countX;tx++){
    if(options.signal?.aborted)throw new Error("Terrain reconstruction aborted");
    const col=tx*tileSize,row=ty*tileSize,width=Math.min(tileSize,grid.width-col),height=Math.min(tileSize,grid.height-row);
    const haloCol=Math.max(0,col-tileHaloPixels),haloRow=Math.max(0,row-tileHaloPixels);
    const haloRight=Math.min(grid.width,col+width+tileHaloPixels),haloBottom=Math.min(grid.height,row+height+tileHaloPixels);
    const haloWidth=haloRight-haloCol,haloHeight=haloBottom-haloRow;
    const [x,y]=pixelToWorld(grid.transform,haloCol,haloRow);
    const subgrid:TerrainGrid={width:haloWidth,height:haloHeight,crs:grid.crs,transform:[x,grid.transform[1],grid.transform[2],y,grid.transform[4],grid.transform[5]]};
    let minHeightM=options.minHeightM,maxHeightM=options.maxHeightM;
    if(localHeightPilot&&maxHeightM-minHeightM>30){
      try{
        const band=estimateTerrainHeightBand({...options,grid:subgrid,images},{
          pilotStepM:Math.max(1,options.heightStepM*2),clusterRadiusM:18,marginM:30
        });
        // A low-consensus tile is not allowed to silently shift the search band.
        if(band.clusterShare>=.55&&band.maxHeightM-band.minHeightM>=options.heightStepM*3){
          minHeightM=band.minHeightM;maxHeightM=band.maxHeightM;pilotTiles++;
        }else pilotFallbacks++;
      }catch{pilotFallbacks++;} // retain the original image-only global search
    }
    const tile=reconstructTerrain({...options,minHeightM,maxHeightM,grid:subgrid,images});
    for(let ry=0;ry<height;ry++)for(let rx=0;rx<width;rx++){
      const i=(row+ry)*grid.width+col+rx;
      const j=(row+ry-haloRow)*haloWidth+(col+rx-haloCol);
      values[i]=tile.elevationMap.values[j]!;
      conf[i]=tile.confidenceMap.values[j]!;
      texture[i]=tile.texture.values[j]!;
      passes[i]=tile.matchPass[j]!;
      rejections[i]=tile.rejectionReasons[j]!;
    }
    completed++;
    onTile?.({completed,total,col,row,width,height});
  }
  let validPixels=0,recoveredPixels=0;
  const ecef=new Float64Array(n*3).fill(NaN),points:number[]=[],qualities:number[]=[];
  let origin:readonly [number,number,number]=[0,0,0];
  for(let row=0;row<grid.height;row++)for(let col=0;col<grid.width;col++){
    const i=row*grid.width+col,h=values[i]!;
    if(!Number.isFinite(h))continue;
    const [x,y]=pixelToWorld(grid.transform,col+0.5,row+0.5);
    const [longitudeDeg,latitudeDeg]=gridCrsToLonLat(x,y,grid.crs);
    const p=geodeticToEcef({longitudeDeg,latitudeDeg,altitudeM:h});
    if(!validPixels)origin=p;
    validPixels++;if(passes[i]===2)recoveredPixels++;
    ecef.set(p,i*3);points.push(...p);qualities.push(conf[i]!);
  }
  const positions=new Float32Array(n*3).fill(NaN),triangles:number[]=[];
  for(let i=0;i<n;i++)if(Number.isFinite(values[i]))for(let k=0;k<3;k++)positions[i*3+k]=ecef[i*3+k]!-origin[k]!;
  const face=(a:number,b:number,c:number)=>{
    const hs=[values[a]!,values[b]!,values[c]!];
    if(hs.every(Number.isFinite)&&Math.max(...hs)-Math.min(...hs)<=maxAdjacentRiseM)triangles.push(a,b,c);
  };
  for(let row=0;row<grid.height-1;row++)for(let col=0;col<grid.width-1;col++){
    const a=row*grid.width+col,b=a+1,c=a+grid.width,d=c+1;
    face(a,c,b);face(b,c,d);
  }
  return {
    elevationMap:{...grid,values,source:"OpenLaunch tiled stereo",unit:"m ellipsoid"},
    confidenceMap:{...grid,values:conf,source:"stereo matching heuristic",unit:"1"},
    texture:{...grid,values:texture,source:images[0]!.source,unit:"input intensity"},
    pointCloud:{positionsEcefM:new Float64Array(points),confidence:new Float32Array(qualities)},
    mesh:{originEcefM:origin,positions,triangles:new Uint32Array(triangles)},
    validPixels,totalPixels:n,matchPass:passes,recoveredPixels,rejectionReasons:rejections,
    sources:images.map(i=>i.source),verticalDatum:"WGS84 ellipsoid",model:options.matcher==="sgm"?"stereo-height-sgm":"stereo-height-sweep",sourceKind:source.kind,tiles:completed,pilotTiles,pilotFallbacks
  };
}
