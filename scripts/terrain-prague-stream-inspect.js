/* Browser + Node-compatible measured terrain ray inspection.
 * Raycasts ORIGINAL source DSM triangles only, never visual-only skirts/aprons.
 * NoData or unloaded tiles return null — no fabricated or extrapolated height.
 */
(function(root){
"use strict";
const EARTH_R=6378137,TAN_HALF=Math.tan(Math.PI/8),EPS=1e-8;
const cachedBounds=new WeakMap(),cachedCellMasks=new WeakMap();
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const norm=v=>{const l=Math.hypot(...v);if(!(l>EPS))throw RangeError("Invalid ray vector");return v.map(n=>n/l);};
function cameraBasis({yaw,pitch,panX,panNorth,vertical,distance}){
 const values=[yaw,pitch,panX,panNorth,vertical,distance];
 if(!values.every(Number.isFinite)||distance<=0||vertical<=0)
   throw RangeError("Invalid inspection camera");
 const ray=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
 const forward=ray.map(v=>-v);
 const right=norm(cross(forward,[0,1,0]));
 const up=norm(cross(right,forward));
 const target=[panX,28*vertical,-panNorth];
 const origin=sub(target,forward.map(v=>v*distance));
 return {forward,right,up,target,origin};
}
function screenRay(camera,x,y,width,height){
 if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)
   throw RangeError("Invalid inspection viewport");
 const c=cameraBasis(camera),aspect=width/height;
 const nx=2*x/width-1,ny=1-2*y/height;
 const direction=norm(c.forward.map((v,i)=>v+
   c.right[i]*nx*aspect*TAN_HALF+c.up[i]*ny*TAN_HALF));
 return {origin:c.origin,direction};
}
function boxHit(ray,bounds,limit=Infinity){
 if(!bounds)return true;
 let tmin=0,tmax=limit;
 for(let axis=0;axis<3;axis++){
   const d=ray.direction[axis],o=ray.origin[axis];
   if(Math.abs(d)<EPS){
     if(o<bounds.min[axis]||o>bounds.max[axis])return false;
     continue;
   }
   let t1=(bounds.min[axis]-o)/d,t2=(bounds.max[axis]-o)/d;
   if(t1>t2)[t1,t2]=[t2,t1];
   tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);
   if(tmin>tmax)return false;
 }
 return tmax>0;
}
function intersect(ray,a,b,c){
 const e1=sub(b,a),e2=sub(c,a);
 const p=cross(ray.direction,e2),det=dot(e1,p);
 if(Math.abs(det)<EPS)return null;
 const inv=1/det,t=sub(ray.origin,a),u=dot(t,p)*inv;
 if(u < -EPS||u>1+EPS)return null;
 const q=cross(t,e1),v=dot(ray.direction,q)*inv;
 if(v < -EPS||u+v>1+EPS)return null;
 const along=dot(e2,q)*inv;
 return along>EPS?{along,u,v}:null;
}
function boundsForTile(tile,vertical=1,baseHeight=180){
 const p=tile.positions;
 if(!p||p.length<9)return null;
 let x0=Infinity,x1=-Infinity,n0=Infinity,n1=-Infinity,z0=Infinity,z1=-Infinity;
 const count=Math.min((tile.width??Math.floor(p.length/3))*(tile.height??1),p.length/3);
 for(let i=0;i<count;i++){
   const j=i*3,x=p[j],north=p[j+1],h=p[j+2];
   if(![x,north,h].every(Number.isFinite))continue;
   x0=Math.min(x0,x);x1=Math.max(x1,x);
   n0=Math.min(n0,north);n1=Math.max(n1,north);
   z0=Math.min(z0,h);z1=Math.max(z1,h);
 }
 if(!Number.isFinite(x0))return null;
 // Only measured vertices bound the pickable region; no seam-only apron vertices.
 return {min:[x0,(z0-baseHeight)*vertical,-n1],
   max:[x1,(z1-baseHeight)*vertical,-n0]};
}
function tileBounds(tile,vertical,baseHeight){
 const cached=cachedBounds.get(tile);
 if(cached?.vertical===vertical&&cached.baseHeight===baseHeight)return cached.bounds;
 const bounds=boundsForTile(tile,vertical,baseHeight);
 cachedBounds.set(tile,{vertical,baseHeight,bounds});
 return bounds;
}
function gridMask(tile){
 if(cachedCellMasks.has(tile))return cachedCellMasks.get(tile);
 const {width:w,height:h,indices,positions:p,measuredTriangles}=tile;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||
   p.length<w*h*3||indices.length<measuredTriangles*3){
   cachedCellMasks.set(tile,null);return null;
 }
 const dx=p[3]-p[0],dy=p[w*3+1]-p[1];
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||dx===0||dy===0){
   cachedCellMasks.set(tile,null);return null;
 }
 const masks=new Uint8Array((w-1)*(h-1));
 let recognized=0;
 for(let i=0;i<measuredTriangles*3;i+=3){
   const [a,b,c]=[indices[i],indices[i+1],indices[i+2]];
   let cell=-1,bit=0;
   if(b===a+1&&c===a+w){cell=a;bit=1;}
   else if(b===a+w&&c===a+w-1){cell=a-1;bit=2;}
   if(cell<0||cell>=w*h||cell%w>=w-1||Math.floor(cell/w)>=h-1){
     cachedCellMasks.set(tile,null);return null;
   }
   masks[Math.floor(cell/w)*(w-1)+cell%w]|=bit;
   recognized++;
 }
 if(recognized!==measuredTriangles){cachedCellMasks.set(tile,null);return null;}
 const result={masks,width:w,height:h,dx,dy,x0:p[0],y0:p[1]};
 cachedCellMasks.set(tile,result);
 return result;
}
function verticalFaces(tile,ray){
 // Exact O(1) candidate selection for a vertical profile ray on the SDK
 // row-major DEM grid; mask was built from the actual measured face list.
 if(Math.abs(ray.direction[0])>EPS||Math.abs(ray.direction[2])>EPS)return null;
 const grid=gridMask(tile);
 if(!grid)return null;
 const {width:w,height:h,dx,dy,x0,y0,masks}=grid;
 const col=(ray.origin[0]-x0)/dx;
 const row=(-ray.origin[2]-y0)/dy;
 if(col < -1e-4||row < -1e-4||col>w-1+1e-4||row>h-1+1e-4)
   return [];
 const hits=[];
 const c0=Math.min(w-2,Math.max(0,Math.floor(col)));
 const r0=Math.min(h-2,Math.max(0,Math.floor(row)));
 // On grid edges, check the immediately adjacent cell as well.
 for(let r=Math.max(0,r0-1);r<=Math.min(h-2,r0+1);r++)
   for(let c=Math.max(0,c0-1);c<=Math.min(w-2,c0+1);c++){
     const mask=masks[r*(w-1)+c],a=r*w+c;
     if(mask&1)hits.push([a,a+1,a+w]);
     if(mask&2)hits.push([a+1,a+w+1,a+w]);
   }
 return hits;
}

function pickMeasured(tiles,ray,{vertical=1,baseHeight=180,maxDistance=25000}={}){
 if(!Number.isFinite(vertical)||vertical<=0||
    !Number.isFinite(baseHeight)||!Number.isFinite(maxDistance)||maxDistance<=0)
   throw RangeError("Invalid terrain inspection scale");
 let best=null,bestT=maxDistance;
 for(const tile of tiles){
   const positions=tile.positions,indices=tile.indices;
   if(!positions||!indices||!Number.isInteger(tile.measuredTriangles))continue;
   const bounds=tileBounds(tile,vertical,baseHeight);
   if(!bounds||!boxHit(ray,bounds,bestT))continue;
   // Only the original SDK triangles are pickable; visual-only seam
   // appendices are excluded. Profiles use a row-major cell mask to avoid
   // scanning ~100,000 triangles 32 times for a single A/B measurement.
   const count=Math.min(tile.measuredTriangles*3,indices.length);
   const candidates=verticalFaces(tile,ray);
   const at=i=>{
     const j=i*3;
     return [positions[j],(positions[j+2]-baseHeight)*vertical,-positions[j+1]];
   };
   const visit=(ia,ib,ic)=>{
     if([ia,ib,ic].some(k=>k*3+2>=positions.length))return;
     const h0=positions[ia*3+2],h1=positions[ib*3+2],h2=positions[ic*3+2];
     if(![h0,h1,h2].every(Number.isFinite))return;
     const hit=intersect(ray,at(ia),at(ib),at(ic));
     if(!hit||hit.along>=bestT)return;
     const w=1-hit.u-hit.v;
     const east=w*positions[ia*3]+hit.u*positions[ib*3]+hit.v*positions[ic*3];
     const north=w*positions[ia*3+1]+hit.u*positions[ib*3+1]+hit.v*positions[ic*3+1];
     const elevationM=w*h0+hit.u*h1+hit.v*h2;
     bestT=hit.along;
     best={id:tile.id,east,north,elevationM,distanceAlongRay:hit.along,
       horizontalCoordinates:"approximate local metres",verticalDatum:"Bpv (Baltic 1957)"};
   };
   if(candidates!==null){
     for(const ids of candidates)visit(ids[0],ids[1],ids[2]);
   }else for(let i=0;i<count;i+=3)
     visit(indices[i],indices[i+1],indices[i+2]);
 }
 return best;
}
function geoFromLocal(east,north,config){
 if(![east,north].every(Number.isFinite)||!config?.center||
    !Number.isFinite(config.centerLatitudeDeg))throw RangeError("Invalid local coordinate frame");
 const scale=Math.cos(config.centerLatitudeDeg*Math.PI/180);
 const longitudeDeg=config.center[0]+east/(EARTH_R*scale)*180/Math.PI;
 const at=Math.log(Math.tan(Math.PI/4+config.center[1]*Math.PI/360))+
   north/(EARTH_R*scale);
 const latitudeDeg=Math.atan(Math.sinh(at))*180/Math.PI;
 return {longitudeDeg,latitudeDeg};
}
function profile(tiles,start,end,{samples=32,vertical=1,baseHeight=180,config}={}){
 if(!start||!end||!Number.isInteger(samples)||samples<2||samples>128)
   throw RangeError("Invalid inspection profile");
 const horizontalDistanceM=Math.hypot(end.east-start.east,end.north-start.north);
 const data=[];
 let valid=0;
 for(let i=0;i<samples;i++){
   const f=i/(samples-1),east=start.east+(end.east-start.east)*f,
     north=start.north+(end.north-start.north)*f;
   // Vertical picking uses original source triangles. It never interpolates
   // across missing tiles or nodata holes.
   const result=pickMeasured(tiles,
     {origin:[east,10000,-north],direction:[0,-1,0]},
     {vertical,baseHeight,maxDistance:20000});
   if(result)valid++;
   data.push({distanceM:horizontalDistanceM*f,...geoFromLocal(east,north,config),
     elevationM:result?result.elevationM:null});
 }
 let surfaceDistanceM=0,ascentM=0,descentM=0,segments=0;
 for(let i=1;i<data.length;i++){
   const p=data[i-1],q=data[i];
   if(p.elevationM===null||q.elevationM===null)continue;
   const dz=q.elevationM-p.elevationM;
   const dx=q.distanceM-p.distanceM;
   surfaceDistanceM+=Math.hypot(dx,dz);
   ascentM+=Math.max(0,dz);descentM+=Math.max(0,-dz);segments++;
 }
 return {samples:data,validSamples:valid,horizontalDistanceM,
   surfaceDistanceM:segments===samples-1?surfaceDistanceM:null,
   ascentM:segments===samples-1?ascentM:null,
   descentM:segments===samples-1?descentM:null,
   verticalDatum:"Bpv (Baltic 1957)",
   note:"Missing heights stay null. Measured source DSM triangles only."};
}
root.OpenLaunchTerrainInspect=Object.freeze({
 cameraBasis,screenRay,boundsForTile,pickMeasured,geoFromLocal,profile
});
})(typeof window!=="undefined"?window:globalThis);
