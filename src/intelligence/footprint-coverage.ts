import type { AreaOfInterest, Geometry, Position } from "../geo/types.js";

export type FootprintCoverageBasis = "stac-footprint-estimate" | "unknown-geometry";
export interface FootprintCoverage {
  /** Null when absent or unsupported geometry. No invented 100% coverage. */
  coveragePercent: number | null;
  basis: FootprintCoverageBasis;
  /** Approximate geographic polygon overlap, never observed cloud or pixel QA. */
  pixelCoverageVerified: false;
}

type XY = readonly [number,number];
function validateRing(raw: readonly Position[]):XY[]|null {
  if (!Array.isArray(raw)||raw.length<4||raw.length>4096)return null;
  const ring:XY[]=[];
  for(const pos of raw) {
    if(!Array.isArray(pos)||pos.length<2)return null;
    const x=pos[0],y=pos[1];
    if(!Number.isFinite(x)||!Number.isFinite(y)||x < -180||x>180||y < -90||y>90)return null;
    if(ring.length&&Math.abs(ring[ring.length-1]![0]-x)>180)return null;
    ring.push([x,y]);
  }
  return ring;
}
function cross(a:XY,b:XY,c:XY):number {
  return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
}
function area(ring:readonly XY[]):number {
  let sum=0;
  for(let i=0;i<ring.length;i++) {
    const p=ring[i]!,q=ring[(i+1)%ring.length]!;
    sum+=p[0]*q[1]-q[0]*p[1];
  }
  return Math.abs(sum)/2;
}
function signed(ring:readonly XY[]):number {
  let sum=0;
  for(let i=0;i<ring.length;i++){
    const p=ring[i]!,q=ring[(i+1)%ring.length]!;
    sum+=p[0]*q[1]-q[0]*p[1];
  }
  return sum/2;
}
/** Clip a potentially concave scene ring against the convex AOI polygon. */
function clip(ring:readonly XY[], boundary:readonly XY[]):XY[] {
  let output=[...ring];
  const orientation=signed(boundary)>=0?1:-1;
  for(let i=0;i<boundary.length;i++) {
    const a=boundary[i]!,b=boundary[(i+1)%boundary.length]!;
    const input=output;output=[];
    for(let j=0;j<input.length;j++) {
      const current=input[j]!,previous=input[(j+input.length-1)%input.length]!;
      const v1=orientation*cross(a,b,previous),v2=orientation*cross(a,b,current);
      const inside1=v1>=-1e-12,inside2=v2>=-1e-12;
      if(inside1!==inside2) {
        const d=v1-v2;
        if(Math.abs(d)>1e-15){
          const t=Math.max(0,Math.min(1,v1/d));
          output.push([previous[0]+t*(current[0]-previous[0]),
            previous[1]+t*(current[1]-previous[1])]);
        }
      }
      if(inside2)output.push(current);
    }
    if(output.length>8192)return [];
    if(output.length===0)break;
  }
  return output;
}
function polygons(geometry:Geometry):readonly (readonly (readonly Position[])[])[]|null {
  if(geometry.type==="Polygon")return [geometry.coordinates];
  if(geometry.type==="MultiPolygon")return geometry.coordinates;
  return null;
}
/**
 * Approximate relative intersection area from STAC footprint polygon rings.
 * Equirectangular lon/lat area fractions are suitable for bounded local AOIs,
 * but NOT certified geodesic areas or guaranteed scene pixel coverage.
 */
export function estimateFootprintCoverage(
  aoi:AreaOfInterest, geometry:Geometry|null|undefined,
):FootprintCoverage {
  const unknown:FootprintCoverage={
    coveragePercent:null,basis:"unknown-geometry",pixelCoverageVerified:false,
  };
  const target=aoi.geometry.type==="Polygon"?aoi.geometry.coordinates[0]:undefined;
  if(!target||!geometry)return unknown;
  const boundary=validateRing(target);
  const parts=polygons(geometry);
  if(!boundary||!parts||parts.length>32)return unknown;
  const boundaryArea=area(boundary);
  if(boundaryArea<1e-12||aoi.bbox[2]-aoi.bbox[0]>180)return unknown;
  let covered=0,ringCount=0;
  for(const polygon of parts) {
    if(!Array.isArray(polygon)||!polygon.length||polygon.length>16)return unknown;
    let net=0;
    for(let i=0;i<polygon.length;i++) {
      if(++ringCount>128)return unknown;
      const ring=validateRing(polygon[i]!);
      if(!ring)return unknown;
      const clipped=clip(ring,boundary);
      net+=(i===0?1:-1)*area(clipped);
    }
    covered+=Math.max(0,net);
  }
  const percentage=Math.max(0,Math.min(100,100*covered/boundaryArea));
  return {coveragePercent:Math.round(percentage*100)/100,
    basis:"stac-footprint-estimate",pixelCoverageVerified:false};
}
