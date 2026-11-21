/* Browser + Node-compatible measured terrain ray inspection.
 * Raycasts ORIGINAL source DSM triangles only, never visual-only skirts/aprons.
 * NoData or unloaded tiles return null — no fabricated or extrapolated height.
 */
(function(root){
"use strict";
const EARTH_R=6378137,TAN_HALF=Math.tan(Math.PI/8),EPS=1e-8;
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
function pickMeasured(tiles,ray,{vertical=1,baseHeight=180,maxDistance=25000}={}){
 if(!Number.isFinite(vertical)||vertical<=0||
    !Number.isFinite(baseHeight)||!Number.isFinite(maxDistance)||maxDistance<=0)
   throw RangeError("Invalid terrain inspection scale");
 let best=null,bestT=maxDistance;
 for(const tile of tiles){
   const positions=tile.positions,indices=tile.indices;
   if(!positions||!indices||!Number.isInteger(tile.measuredTriangles))continue;
   const bounds=tile.bounds??boundsForTile(tile,vertical,baseHeight);
   if(!bounds||!boxHit(ray,bounds,bestT))continue;
   // First part of index list is the original SDK mesh. Never pick skirts.
   const count=Math.min(tile.measuredTriangles*3,indices.length);
   const at=i=>{
     const j=i*3;
     return [positions[j],(positions[j+2]-baseHeight)*vertical,-positions[j+1]];
   };
   for(let i=0;i<count;i+=3){
     const ia=indices[i],ib=indices[i+1],ic=indices[i+2];
     if([ia,ib,ic].some(k=>k*3+2>=positions.length))continue;
     const h0=positions[ia*3+2],h1=positions[ib*3+2],h2=positions[ic*3+2];
     if(![h0,h1,h2].every(Number.isFinite))continue;
     const hit=intersect(ray,at(ia),at(ib),at(ic));
     if(!hit||hit.along>=bestT)continue;
     const w=1-hit.u-hit.v;
     const east=w*positions[ia*3]+hit.u*positions[ib*3]+hit.v*positions[ic*3];
     const north=w*positions[ia*3+1]+hit.u*positions[ib*3+1]+hit.v*positions[ic*3+1];
     const elevationM=w*h0+hit.u*h1+hit.v*h2;
     bestT=hit.along;
     best={id:tile.id,east,north,elevationM,distanceAlongRay:hit.along,
       horizontalCoordinates:"approximate local metres",verticalDatum:"Bpv (Baltic 1957)"};
   }
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
