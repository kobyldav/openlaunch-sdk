import {validateRaster,type RasterGrid} from "../eo/raster.js";
/** Non-destructive local quality pass. 0=no data, 1=measured, 2=rejected, 3=interpolated. */
export function refineTerrainSurface(dem:RasterGrid,options:{outlierM?:number;fillRadius?:number;minNeighbors?:number}={}):{grid:RasterGrid;flags:Uint8Array;rejected:number;filled:number}{
  validateRaster(dem);
  const threshold=options.outlierM??35,radius=options.fillRadius??0,min=options.minNeighbors??5;
  if(!Number.isFinite(threshold)||threshold<=0||!Number.isInteger(radius)||radius<0||radius>3||!Number.isInteger(min)||min<3||min>8)throw new RangeError("Invalid terrain quality settings");
  const n=dem.values.length,values=dem.values.slice(),flags=new Uint8Array(n);let rejected=0,filled=0;
  const neighbors=(x:number,y:number,r:number,arr:Float64Array)=>{const a:number[]=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=dem.width||yy>=dem.height)continue;const v=arr[yy*dem.width+xx]!;if(Number.isFinite(v))a.push(v);}return a;};
  const median=(a:number[])=>{a.sort((x,y)=>x-y);const m=a.length>>1;return a.length%2?a[m]!:(a[m-1]!+a[m]!)/2;};
  for(let y=0;y<dem.height;y++)for(let x=0;x<dem.width;x++){const i=y*dem.width+x,v=dem.values[i]!;if(!Number.isFinite(v))continue;flags[i]=1;const a=neighbors(x,y,1,dem.values);if(a.length<min)continue;const med=median(a),mad=median(a.map(k=>Math.abs(k-med)));if(Math.abs(v-med)>Math.max(threshold,6*mad)){values[i]=NaN;flags[i]=2;rejected++;}}
  if(radius){const stable=values.slice();for(let y=radius;y<dem.height-radius;y++)for(let x=radius;x<dem.width-radius;x++){const i=y*dem.width+x;if(Number.isFinite(stable[i]))continue;const a=neighbors(x,y,radius,stable);if(a.length<min||Math.max(...a)-Math.min(...a)>threshold*2)continue;
    // Require measured neighbors on all four sides to avoid extrapolating boundaries.
    if(![stable[i-radius],stable[i+radius],stable[i-radius*dem.width],stable[i+radius*dem.width]].every(Number.isFinite))continue;
    values[i]=median(a);flags[i]=3;filled++;}}
  return {grid:{...dem,values,source:"OpenLaunch locally refined DSM"},flags,rejected,filled};
}
