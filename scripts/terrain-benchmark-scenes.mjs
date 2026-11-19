// Deterministic synthetic DSMs; no reference surface is passed to stereo.
export const sceneIds=["flat","hills","mountains","urban","industrial","forest","water","clouds","repetitive","no-parallax"];
export function makeTerrainBenchmarkScene(id,{size=32}={}){
 if(!sceneIds.includes(id)||!Number.isInteger(size)||size<16||size>64)throw Error("Invalid synthetic scene");
 const crs="EPSG:32633",origin=[460000,5540000,200],w=200,h=200,cx=(w-1)/2,cy=(h-1)/2,f=220,alt=145,step=.8;
 const ground=(x,y)=>12+1.1*Math.sin(x/13)*Math.cos(y/10);
 const inside=(x,y,cx,cy,rx,ry)=>Math.abs(x-cx)<rx&&Math.abs(y-cy)<ry;
 const surface=(x,y)=>{
  if(id==="flat"||id==="no-parallax"||id==="repetitive")return 12;
  if(id==="mountains")return 8+24*Math.exp(-((x+5)**2+(y-2)**2)/135)+8*Math.exp(-((x-10)**2+(y+9)**2)/100)+2*Math.sin(x/5);
  if(id==="urban"){let z=ground(x,y);for(const [a,b,rx,ry,ht] of [[-7,-6,4,4,8],[6,5,4,5,11],[-7,8,3,3,6],[8,-7,3,4,5]])if(inside(x,y,a,b,rx,ry))z+=ht+Math.max(0,1.5-Math.abs(x-a)*.4);return z;}
  if(id==="industrial")return ground(x,y)+(inside(x,y,0,0,9,5)?7+Math.max(0,2-Math.abs(y)*.4):0);
  if(id==="forest"){let z=ground(x,y);for(let a=-12;a<=12;a+=5)for(let b=-12;b<=12;b+=5)z+=4*Math.exp(-((x-a)**2+(y-b)**2)/3);return z;}
  return 12+9*Math.exp(-((x+7)**2+(y-3)**2)/190)+2*Math.sin(x/9)*Math.cos(y/10);
 };
 const isWater=(x,y)=>id==="water"&&Math.abs(x+2*Math.sin(y/6))<5;
 const texture=(x,y)=>{
  if(isWater(x,y))return .2;
  if(id==="repetitive")return Math.sin(Math.PI*x)+Math.cos(Math.PI*y);
  return Math.sin(.57*x+.31*y)+.7*Math.cos(.21*x-.66*y)+.45*Math.sin(.93*x-.27*y)+.2*Math.cos(.044*x*y);
 };
 const view=(camX,camY,index)=>{
  const matrix=[f,0,-cx,-f*camX+cx*alt,0,-f,-cy,f*camY+cy*alt,0,0,-1,alt];
  const values=Float64Array.from({length:w*h},(_,i)=>{
   const u=(i%w-cx)/f,v=(Math.floor(i/w)-cy)/f;
   // First visible ray/height-field intersection, including occlusion by roofs.
   let z=40,prev=z;
   const ray=z=>[camX+(alt-z)*u,camY-(alt-z)*v];
   while(z>=0){const [x,y]=ray(z);if(z<=surface(x,y))break;prev=z;z-=.5;}
   let lo=z,hi=prev;for(let j=0;j<8;j++){const m=(lo+hi)/2,[x,y]=ray(m);if(m<=surface(x,y))lo=m;else hi=m;}
   const [x,y]=ray((lo+hi)/2);
   if(id==="clouds"&&index===1&&Math.abs(x)<5&&Math.abs(y)<8)return NaN;
   return texture(x,y);
  });
  return {width:w,height:h,source:id+"-view-"+index,values,calibration:{kind:"projected",camera:{crs,worldOffset:origin,matrix}}};
 };
 const grid={width:size,height:size,crs,transform:[origin[0]-size*step/2,step,0,origin[1]+size*step/2,0,-step]};
 const images=(id==="no-parallax"?[[0,0],[0,0],[0,0]]:[[-30,0],[30,0],[0,23]]).map(([x,y],i)=>view(x,y,i));
 const reference=Array.from({length:size*size},(_,i)=>{const x=(i%size+.5-size/2)*step,y=(size/2-Math.floor(i/size)-.5)*step;return {col:i%size,row:Math.floor(i/size),heightM:origin[2]+surface(x,y),zone:isWater(x,y)&&Math.abs(x+2*Math.sin(y/6))<2?"water-core":id==="clouds"&&Math.abs(x)<2&&Math.abs(y)<5?"cloud-core":"land"};});
 return {grid,source:{kind:"aerial",images},reference,minHeightM:202,maxHeightM:240,heightStepM:.5,resolutionM:step};
}
