/** Real-source Prague building overlays.
 *
 * Footprints: OpenStreetMap closed building ways, © contributors / ODbL.
 * Ground: actual ČÚZK DMR 5G F32 image, heights Bpv.
 * Roof proxy: if OSM height tag exists, ground + explicit OSM height; otherwise
 * estimated FROM measured ČÚZK DMP OK DSM vs measured DMR ground.
 * Roof shape is a deliberately flat LOD1 VISUAL approximation, not surveyed.
 * Missing heights, interiors/courtyards, invalid footprints -> omitted.
 */
import {decodeTerrainTiff,TiffDirectory} from "../dist/eo/geotiff.js";
import {mercatorFromLonLat,PRAGUE_STREAM_REGION} from "./terrain-prague-stream-grid.mjs";
export const BUILDING_LAYER_VERSION=1;
export const CUZK_DMR_5G="https://ags.cuzk.gov.cz/arcgis/rest/services/3D/dmr5g_wm/ImageServer";
export const OVERPASS_ENDPOINT="https://overpass-api.de/api/interpreter";
const LAT=PRAGUE_STREAM_REGION.centerLatitudeDeg*Math.PI/180;
const SCALE=Math.cos(LAT);
const C=mercatorFromLonLat((PRAGUE_STREAM_REGION.west+PRAGUE_STREAM_REGION.east)/2,
 (PRAGUE_STREAM_REGION.south+PRAGUE_STREAM_REGION.north)/2);
const finite=Number.isFinite;
export function world(lon,lat){
 const p=mercatorFromLonLat(lon,lat);
 return [(p[0]-C[0])*SCALE,(p[1]-C[1])*SCALE];
}
export function parseOsmHeight(input){
 if(typeof input!=="string")return null;
 const match=/^\s*(\d+(?:[.,]\d+)?)\s*(m|meter|meters|metre|metres|ft|feet)?\s*$/i.exec(input);
 if(!match)return null;
 const z=Number(match[1].replace(",","."))*(match[2]&&/^(ft|feet)$/i.test(match[2])?.3048:1);
 return finite(z)&&z>=2.5&&z<=300?z:null;
}
export function overpassQuery(spec){
 const nums=[spec.west,spec.south,spec.east,spec.north];
 if(nums.some(n=>!finite(n))||spec.east-spec.west>.02||spec.north-spec.south>.02||
   spec.west<12||spec.east>19||spec.south<48||spec.north>52)
   throw RangeError("Bounded Czech building tile required");
 return '[out:json][timeout:30][maxsize:16777216];'+
   'way["building"]('+[spec.south,spec.west,spec.north,spec.east].join(",")+');out tags geom;';
}
async function readBounded(response,maxBytes){
 if(!response.ok)throw Error("Building source HTTP "+response.status);
 const length=Number(response.headers.get("content-length")||0);
 if(length>maxBytes)throw Error("Building response byte budget exceeded");
 const reader=response.body?.getReader();
 if(!reader)throw Error("Building source returned an empty stream");
 const chunks=[];let size=0;
 try{
   for(;;){
     const {done,value}=await reader.read();if(done)break;
     size+=value.length;
     if(size>maxBytes){await reader.cancel();throw Error("Building response exceeded limit");}
     chunks.push(value);
   }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;
 for(const c of chunks){bytes.set(c,i);i+=c.length;}
 return bytes;
}
export async function fetchOsmFootprints(spec,{fetchImpl=fetch,timeoutMs=35000}={}){
 const body=new URLSearchParams({data:overpassQuery(spec)});
 const res=await fetchImpl(OVERPASS_ENDPOINT,{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",
     Accept:"application/json"},
   body:body.toString(),signal:AbortSignal.timeout(timeoutMs)
 });
 const data=JSON.parse(new TextDecoder().decode(await readBounded(res,8*1024*1024)));
 if(!Array.isArray(data.elements))throw Error("Overpass did not return OSM elements");
 if(data.elements.length>1500)throw Error("Building feature count exceeds budget");
 return data.elements;
}
export async function fetchGroundDmr(spec,{fetchImpl=fetch,timeoutMs=90000}={}){
 const [x0,y0]=mercatorFromLonLat(spec.west,spec.south);
 const [x1,y1]=mercatorFromLonLat(spec.east,spec.north);
 const width=Math.max(2,Math.ceil((x1-x0)*SCALE/4));
 const height=Math.max(2,Math.ceil((y1-y0)*SCALE/4));
 if(width*height>50000||width>1024||height>1024)
   throw RangeError("DMR ground tile exceeds 50k true height samples");
 const url=new URL(CUZK_DMR_5G+"/exportImage");
 url.search=new URLSearchParams({
   f:"image",format:"tiff",bbox:[x0,y0,x1,y1].join(","),
   bboxSR:"3857",imageSR:"3857",size:width+","+height,
   pixelType:"F32",interpolation:"RSP_NearestNeighbor",
   compression:"None",returnSquarePixels:"false",adjustAspectRatio:"false"
 }).toString();
 const response=await fetchImpl(url.href,{
   signal:AbortSignal.timeout(timeoutMs),headers:{Accept:"image/tiff"}});
 const bytes=await readBounded(response,12*1024*1024);
 if(bytes.length<16)throw Error("DMR raster missing elevation TIFF");
 const dir=new TiffDirectory(bytes);
 if(dir.scalar(277,1)!==1||dir.scalar(339,1)!==3||dir.scalar(258)!==32)
   throw Error("ČÚZK DMR 5G did not return genuine F32 heights");
 const raster=await decodeTerrainTiff(bytes,{maxPixels:50000,maxInputBytes:12*1024*1024});
 if(raster.width!==width||raster.height!==height)
   throw Error("DMR raster dimensions mismatch");
 const values=Float64Array.from(raster.values,z=>
   finite(z)&&z> -100&&z<2500?z:NaN);
 if(values.filter(finite).length<4)throw Error("No real DMR ground heights");
 return {width,height,values,bbox:[spec.west,spec.south,spec.east,spec.north],
   source:CUZK_DMR_5G,verticalDatum:"Bpv (Baltic 1957)"};
}
const pick=(r,x,y)=>{
 const [w,s,e,n]=r.bbox;
 const [mx,my]=mercatorFromLonLat(x,y);
 const a=mercatorFromLonLat(w,s),b=mercatorFromLonLat(e,n);
 const col=Math.floor((mx-a[0])/(b[0]-a[0])*r.width);
 const row=Math.floor((b[1]-my)/(b[1]-a[1])*r.height);
 if(col<0||row<0||col>=r.width||row>=r.height)return null;
 const z=r.values[row*r.width+col];
 return finite(z)?z:null;
};
function inPolygon(x,y,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[i],b=ring[j];
   if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
     inside=!inside;
 }
 return inside;
}
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null;};
function roofSamples(dsm,ring){
 const positions=dsm.positions;
 const width=dsm.width,height=dsm.height,points=[];
 const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs);
 const minY=Math.min(...ys),maxY=Math.max(...ys);
 // All DSM source heights are retained in the stored v2 tile.
 for(let i=0;i<width*height;i++){
   const x=positions[3*i]+dsm.originMeters[0],
     y=positions[3*i+1]+dsm.originMeters[1],z=positions[3*i+2];
   if(x<minX||x>maxX||y<minY||y>maxY||!finite(z))continue;
   if(inPolygon(x,y,ring))points.push(z);
   if(points.length>=300)break;
 }
 return points;
}
function area(ring){
 let a=0;
 for(let i=0;i<ring.length;i++){
   const p=ring[i],q=ring[(i+1)%ring.length];a+=p[0]*q[1]-q[0]*p[1];
 }
 return a/2;
}
function triangulate(ring){
 // Conservative ear-clipping; rejects unsupported self-intersections/holes.
 const ids=Array.from({length:ring.length},(_,i)=>i),out=[];
 const ccw=area(ring)>0;
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const inside=(p,a,b,c)=>{
   const d1=cross(a,b,p),d2=cross(b,c,p),d3=cross(c,a,p);
   return ccw?[d1,d2,d3].every(v=>v>=-1e-7):
     [d1,d2,d3].every(v=>v<=1e-7);
 };
 for(let iter=0;ids.length>3&&iter<1000;iter++){
   let found=false;
   for(let n=0;n<ids.length;n++){
     const i=ids[(n-1+ids.length)%ids.length],j=ids[n],k=ids[(n+1)%ids.length];
     if(ccw?cross(ring[i],ring[j],ring[k])<=1e-7:
       cross(ring[i],ring[j],ring[k])>=-1e-7)continue;
     if(ids.some(v=>v!==i&&v!==j&&v!==k&&
       inside(ring[v],ring[i],ring[j],ring[k])))continue;
     out.push(i,j,k);ids.splice(n,1);found=true;break;
   }
   if(!found)return null;
 }
 if(ids.length!==3)return null;
 out.push(...ids);
 return out;
}
export function buildBuildings(spec,elements,ground,dsm){
 if(!Array.isArray(elements)||elements.length>1500||
   ground.verticalDatum!=="Bpv (Baltic 1957)"||
   dsm.verticalDatum!=="Bpv (Baltic 1957)")
   throw Error("Buildings need real OSM footprints and both measured Bpv surfaces");
 const pos=[],colors=[],triangles=[];
 let tagged=0,estimated=0,skipped=0;
 const maxBuildings=350;
 for(const el of elements){
   if(pos.length/3>48000||tagged+estimated>=maxBuildings)break;
   if(el.type!=="way"||!el.tags?.building||
     !Array.isArray(el.geometry)||el.geometry.length<4||
     el.geometry.length>100){skipped++;continue;}
   const g=el.geometry;
   if(Math.abs(g[0].lon-g[g.length-1].lon)>1e-8||
      Math.abs(g[0].lat-g[g.length-1].lat)>1e-8){skipped++;continue;}
   const coords=g.slice(0,-1);
   if(coords.some(p=>!finite(p.lon)||!finite(p.lat)||Math.abs(p.lat)>85)){
     skipped++;continue;
   }
   const geoCenter=[coords.reduce((sum,p)=>sum+p.lon,0)/coords.length,
     coords.reduce((sum,p)=>sum+p.lat,0)/coords.length];
   if(geoCenter[0]<spec.west||geoCenter[0]>=spec.east||
      geoCenter[1]<spec.south||geoCenter[1]>=spec.north){
     skipped++;continue;
   }
   const ring=coords.map(p=>world(p.lon,p.lat)),roofFaces=triangulate(ring);
   if(!roofFaces||Math.abs(area(ring))<15){skipped++;continue;}
   const base=coords.map(p=>pick(ground,p.lon,p.lat));
   if(base.some(z=>z===null)){skipped++;continue;}
   const baseMid=median(base);
   const explicit=parseOsmHeight(el.tags.height);
   const observed=explicit===null?roofSamples(dsm,ring):[];
   const roofZ=explicit!==null?baseMid+explicit:
     observed.length>=3?median(observed):null;
   if(roofZ===null||roofZ-baseMid<2.5||roofZ-baseMid>300){
     skipped++;continue;
   }
   const start=pos.length/3,n=ring.length;
   if(start+2*n>65535){skipped++;continue;}
   for(let i=0;i<n;i++){
     const [x,y]=ring[i];
     pos.push(x,y,base[i]);
     colors.push(.31,.39,.46);
   }
   for(let i=0;i<n;i++){
     const [x,y]=ring[i];
     pos.push(x,y,roofZ);
     colors.push(.66,.69,.68);
   }
   for(let i=0;i<n;i++){
     const j=(i+1)%n;
     triangles.push(start+i,start+j,start+n+j,
       start+i,start+n+j,start+n+i);
   }
   for(let i=0;i<roofFaces.length;i+=3)
     triangles.push(start+n+roofFaces[i],start+n+roofFaces[i+1],start+n+roofFaces[i+2]);
   if(explicit!==null)tagged++;else estimated++;
 }
 if(triangles.some(id=>id>=pos.length/3))throw Error("Building index overflow");
 return {status:"real-source-buildings",key:spec.key,
   source:"© OpenStreetMap contributors (ODbL); ground © ČÚZK DMR 5G (Bpv); roof © ČÚZK DMP OK (Bpv) when estimated",
   verticalDatum:"Bpv (Baltic 1957)",roofGeometry:"flat-LOD1-visual-proxy",
   heightMethods:{explicitOsmHeight:tagged,estimatedDsmMinusDmr:estimated,omitted:skipped},
   buildings:tagged+estimated,renderVertices:pos.length/3,
   triangles:triangles.length/3,
   positionsF32LE:Buffer.from(new Float32Array(pos).buffer).toString("base64"),
   colorsF32LE:Buffer.from(new Float32Array(colors).buffer).toString("base64"),
   trianglesU16LE:Buffer.from(new Uint16Array(triangles).buffer).toString("base64")};
}
