/** WGS84 UTM, EPSG:32601..32660 (N) and EPSG:32701..32760 (S).
 * Standard ellipsoidal Transverse Mercator series. Not a generic CRS engine.
 * Projection uncertainty grows outside the selected 6-degree UTM zone.
 */
const WGS84_A=6378137;
const WGS84_F=1/298.257223563;
const E2=WGS84_F*(2-WGS84_F);
const EP2=E2/(1-E2);
const K0=0.9996;
const E4=E2*E2, E6=E4*E2;
const RAD=Math.PI/180;
const MERCATOR_EASTING=500000;
const SOUTH_FALSE_NORTHING=10000000;
export type UtmCrs=`EPSG:${number}`;
export interface UtmZone { zone:number; hemisphere:"north"|"south"; centralMeridian:number; }
export function utmZone(crs:string):UtmZone|null {
  const found=/^EPSG:(326|327)(0[1-9]|[1-5][0-9]|60)$/.exec(crs);
  if(!found)return null;
  const zone=Number(found[2]);
  return {zone,hemisphere:found[1]==="326"?"north":"south",
    centralMeridian:(zone*6-183)};
}
function meridianArc(phi:number):number {
  return WGS84_A*((1-E2/4-3*E4/64-5*E6/256)*phi
    -(3*E2/8+3*E4/32+45*E6/1024)*Math.sin(2*phi)
    +(15*E4/256+45*E6/1024)*Math.sin(4*phi)
    -(35*E6/3072)*Math.sin(6*phi));
}
export function lonLatToUtm(lon:number,lat:number,crs:UtmCrs):[number,number] {
  const z=utmZone(crs);
  if(!z)throw new RangeError("Unsupported WGS84 UTM EPSG code");
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon< -180||lon>180||lat< -80||lat>84)
    throw new RangeError("WGS84 UTM latitude must be within [-80,84] and longitude [-180,180]");
  if(z.hemisphere==="north"&&lat<0||z.hemisphere==="south"&&lat>0)
    throw new RangeError("UTM hemisphere does not match latitude");
  let diff=(lon-z.centralMeridian)*RAD;
  if(diff>Math.PI)diff-=2*Math.PI;
  if(diff< -Math.PI)diff+=2*Math.PI;
  // Do not silently yield meaningless coordinates outside the 6-degree zone (+ tolerance).
  if(Math.abs(diff)>6*RAD)throw new RangeError("Coordinate is outside the supported UTM zone vicinity");
  const phi=lat*RAD, sin=Math.sin(phi),cos=Math.cos(phi),tan=Math.tan(phi);
  const n=WGS84_A/Math.sqrt(1-E2*sin*sin);
  const t=tan*tan,c=EP2*cos*cos,a=diff*cos;
  const easting=MERCATOR_EASTING+K0*n*(a+(1-t+c)*a**3/6+
    (5-18*t+t*t+72*c-58*EP2)*a**5/120);
  const northing=K0*(meridianArc(phi)+n*tan*(a*a/2+
    (5-t+9*c+4*c*c)*a**4/24+
    (61-58*t+t*t+600*c-330*EP2)*a**6/720))+
    (z.hemisphere==="south"?SOUTH_FALSE_NORTHING:0);
  return [easting,northing];
}
export function utmToLonLat(x:number,y:number,crs:UtmCrs):[number,number] {
  const z=utmZone(crs);
  if(!z)throw new RangeError("Unsupported WGS84 UTM EPSG code");
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<100000||x>900000||y<0||y>10000000)
    throw new RangeError("Invalid UTM easting/northing");
  const m=(y-(z.hemisphere==="south"?SOUTH_FALSE_NORTHING:0))/K0;
  const mu=m/(WGS84_A*(1-E2/4-3*E4/64-5*E6/256));
  const e1=(1-Math.sqrt(1-E2))/(1+Math.sqrt(1-E2));
  const phi1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)
    +(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)
    +(151*e1**3/96)*Math.sin(6*mu)
    +(1097*e1**4/512)*Math.sin(8*mu);
  const sin=Math.sin(phi1),cos=Math.cos(phi1),tan=Math.tan(phi1);
  const n1=WGS84_A/Math.sqrt(1-E2*sin*sin);
  const r1=WGS84_A*(1-E2)/(1-E2*sin*sin)**1.5;
  const t1=tan*tan,c1=EP2*cos*cos,d=(x-MERCATOR_EASTING)/(n1*K0);
  const lat=phi1-(n1*tan/r1)*(d*d/2-
    (5+3*t1+10*c1-4*c1*c1-9*EP2)*d**4/24+
    (61+90*t1+298*c1+45*t1*t1-252*EP2-3*c1*c1)*d**6/720);
  const lon=z.centralMeridian*RAD+(d-(1+2*t1+c1)*d**3/6+
    (5-2*c1+28*t1-3*c1*c1+8*EP2+24*t1*t1)*d**5/120)/cos;
  const result:[number,number]=[lon/RAD,lat/RAD];
  if(!Number.isFinite(result[0])||!Number.isFinite(result[1])||
    result[0]< -180||result[0]>180||result[1]< -80.01||result[1]>84.01)
    throw new RangeError("Decoded UTM coordinate outside supported WGS84 area");
  return result;
}
