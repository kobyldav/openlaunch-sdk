/** Shared browser tile visibility planner; depends only on actual camera geometry.
 * The server serves this unchanged as a static script; no geographic guesses.
 */
(function(root){
"use strict";
const R=6378137,HALF_FOV_TAN=Math.tan(Math.PI/8);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function merc(lon,lat){
 return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
}
function createPlanner(config,{maxCoarse=28,maxFineGroups=2}={}){
 if(!config||!config.bounds||config.levels.length!==2)
   throw new RangeError("Terrain planner needs a valid two-level manifest");
 const [west,south,east,north]=config.bounds;
 const [mx,my]=merc(...config.center);
 const scale=Math.cos(config.centerLatitudeDeg*Math.PI/180);
 const world=(lon,lat)=>{
   const [x,y]=merc(lon,lat);
   return [(x-mx)*scale,(y-my)*scale];
 };
 const tiles=config.levels.map((level,z)=>{
   const result=[];
   for(let y=0;y<level.rows;y++)for(let x=0;x<level.cols;x++){
     const b=[west+(east-west)*x/level.cols,
       north-(north-south)*(y+1)/level.rows,
       west+(east-west)*(x+1)/level.cols,
       north-(north-south)*y/level.rows];
     const a=world(b[0],b[1]),c=world(b[2],b[3]);
     const center=[(a[0]+c[0])/2,(a[1]+c[1])/2];
     const radius2D=Math.hypot(c[0]-a[0],c[1]-a[1])/2;
     result.push({z,x,y,key:z+"-"+x+"-"+y,
       parent:z===1?"0-"+Math.floor(x/2)+"-"+Math.floor(y/2):null,
       center,radius2D});
   }
   return result;
 });
 let detailActive=false;
 let previousGroups=new Set();
 function basis({yaw,pitch,panX,panNorth,vertical,distance}){
   const ray=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
   const forward=ray.map(x=>-x),right=norm(cross(forward,[0,1,0]));
   return {forward,right,up:norm(cross(right,forward)),panX,panNorth,vertical,distance};
 }
 function intersects(tile,cam,aspect,margin=1.22){
   // Surface elevations are bounded conservatively around 180..350 m Bpv.
   // Conservative height sphere avoids throwing away hill/roof tiles.
   const rel=[tile.center[0]-cam.panX,30*cam.vertical-28*cam.vertical,
     -tile.center[1]+cam.panNorth];
   const depth=dot(rel,cam.forward)+cam.distance;
   const radius=Math.hypot(tile.radius2D,170*cam.vertical);
   if(depth < -radius*margin)return false;
   const viewportDepth=Math.max(0,depth);
   return Math.abs(dot(rel,cam.right)) <= viewportDepth*HALF_FOV_TAN*aspect+radius*margin &&
     Math.abs(dot(rel,cam.up))<=viewportDepth*HALF_FOV_TAN+radius*margin;
 }
 function choose({yaw,pitch,panX,panNorth,vertical,distance,aspect,enableDetail}){
   if(![yaw,pitch,panX,panNorth,vertical,distance,aspect].every(Number.isFinite)||
      distance<1||aspect<=0||vertical<=0)throw new RangeError("Invalid camera");
   if(!enableDetail)detailActive=false;
   else if(!detailActive&&distance<=1250)detailActive=true;
   else if(detailActive&&distance>=1750)detailActive=false;
   const cam=basis({yaw,pitch,panX,panNorth,vertical,distance});
   const coarse=tiles[0].filter(t=>intersects(t,cam,aspect)).map(t=>({
     ...t,d:Math.hypot(t.center[0]-panX,t.center[1]-panNorth)
   }));
   coarse.sort((a,b)=>a.d-b.d);
   coarse.length=Math.min(coarse.length,maxCoarse);
   const fine=[];
   const nextGroups=new Set();
   if(detailActive){
     const inner=clamp(distance*.72+250,450,950);
     const groups=coarse.filter(t=>t.d<inner+(previousGroups.has(t.key)?220:0))
       .sort((a,b)=>(a.d-(previousGroups.has(a.key)?110:0))-
         (b.d-(previousGroups.has(b.key)?110:0)))
       .slice(0,maxFineGroups);
     for(const parent of groups){
       nextGroups.add(parent.key);
       for(const tile of tiles[1])if(tile.parent===parent.key)fine.push({
         ...tile,d:Math.hypot(tile.center[0]-panX,tile.center[1]-panNorth)
       });
     }
   }
   previousGroups=nextGroups;
   return {coarse,finer:fine,detailActive};
 }
 return {choose,intersects:(tile,camera,aspect)=>intersects(tile,basis(camera),aspect),
   tileLevels:tiles,world};
}
root.OpenLaunchTilePlanner=Object.freeze({createPlanner});
})(typeof window!=="undefined"?window:globalThis);
