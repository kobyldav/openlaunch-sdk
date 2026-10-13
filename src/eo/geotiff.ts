import type { RasterCrs, RasterGrid, RasterTransform } from "./raster.js";
import { validateRaster } from "./raster.js";

export interface GeoTiffDecodeOptions {
  maxPixels?: number;
  /** TIFF IFD index, 0 = full-resolution first image. Overview IFDs not followed. */
  maxInputBytes?: number;
}

type TiffValue={type:number; count:number; dataOffset:number};
type SampleKind=1|2|3;
const BYTE_SIZE:Readonly<Record<number,number>>={
  1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8,16:8,17:8,18:8,
};

/**
 * Decode one-band georeferenced TIFF/COG bytes (classic TIFF or BigTIFF).
 * Supports uncompressed or zlib Deflate tiles/strips, horizontal predictor,
 * 8/16/32-bit integer and 32/64-bit IEEE float samples, EPSG:4326/3857.
 * Not a general TIFF library: JP2, JPEG, LZW, multi-band pixel-interleaving,
 * predictor 3 and arbitrary CRSs fail explicitly.
 *
 * Operates on bounded supplied bytes, not remote COG HTTP range requests.
 */
export async function decodeGeoTiff(source:ArrayBuffer|Uint8Array,options:GeoTiffDecodeOptions={}):Promise<RasterGrid>{
  const bytes=source instanceof Uint8Array?source:new Uint8Array(source);
  const maxInputBytes=options.maxInputBytes??64*1024*1024;
  if(!(Number.isSafeInteger(maxInputBytes)&&maxInputBytes>0&&maxInputBytes<=256*1024*1024))
    throw new RangeError("maxInputBytes must be 1..268435456");
  if(bytes.byteLength>maxInputBytes)throw new RangeError("GeoTIFF input exceeds maxInputBytes");
  const tiff=new TiffDirectory(bytes);
  const width=tiff.scalar(256),height=tiff.scalar(257);
  const maxPixels=options.maxPixels??4_194_304;
  if(!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>16_777_216)throw new RangeError("maxPixels must be 1..16777216");
  if(!(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width*height<=maxPixels))
    throw new RangeError("GeoTIFF dimensions exceed maxPixels or are invalid");

  const bps=tiff.scalar(258,8);
  const samples=tiff.scalar(277,1);
  const sampleFormat=tiff.scalar(339,1) as SampleKind;
  const compression=tiff.scalar(259,1);
  const predictor=tiff.scalar(317,1);
  const planar=tiff.scalar(284,1);
  if(samples!==1 || planar!==1)throw new RangeError("Only single-band planar-contiguous GeoTIFF supported");
  if(![8,16,32,64].includes(bps))throw new RangeError("Unsupported BitsPerSample");
  if(!([1,2].includes(sampleFormat)&&[8,16,32].includes(bps) || sampleFormat===3&&[32,64].includes(bps)))
    throw new RangeError("Unsupported SampleFormat / BitsPerSample");
  if(![1,8,32946].includes(compression))throw new RangeError("Unsupported TIFF compression (expected none/Deflate)");
  if(predictor!==1 && predictor!==2)throw new RangeError("Unsupported TIFF predictor (only 1/2)");
  if(predictor===2&&sampleFormat===3)throw new RangeError("Float predictor 2 unsupported: use a compatible integer GeoTIFF");

  const crs=readCrs(tiff);
  const transform=readTransform(tiff);
  const nodataText=tiff.ascii(42113);
  const nodata=nodataText===undefined?undefined:Number(nodataText.trim());
  const useNodata=nodataText!==undefined && !Number.isNaN(nodata);
  const output=new Float64Array(width*height);
  output.fill(NaN);

  const tileWidths=tiff.numbers(322);
  const tileHeights=tiff.numbers(323);
  const tiled=tileWidths!==undefined && tileHeights!==undefined;
  const blockWidth=tiled?tileWidths[0]!:width;
  const blockHeight=tiled?tileHeights[0]!:tiff.scalar(278,height);
  if(!(Number.isSafeInteger(blockWidth)&&Number.isSafeInteger(blockHeight)&&blockWidth>0&&blockHeight>0))
    throw new RangeError("Invalid tile/strip size");
  const across=Math.ceil(width/blockWidth),down=Math.ceil(height/blockHeight);
  const blockCount=across*down;
  if(!Number.isSafeInteger(blockCount)||blockCount<1||blockCount>1_000_000)
    throw new RangeError("Too many TIFF blocks");
  const offsets=tiff.numbers(tiled?324:273);
  const lengths=tiff.numbers(tiled?325:279);
  if(!offsets||!lengths||offsets.length!==blockCount||lengths.length!==blockCount)
    throw new RangeError("TIFF tile/strip offsets and byte counts do not match expected block layout");
  const bytesPerSample=bps/8;
  for(let block=0;block<blockCount;block++){
    const blockRow=Math.floor(block/across),blockCol=block%across;
    const usedHeight=Math.min(blockHeight,height-blockRow*blockHeight);
    // Tile boundary blocks still contain padded samples; strips contain only real rows.
    const physicalHeight=tiled?blockHeight:usedHeight;
    const expected=blockWidth*physicalHeight*bytesPerSample;
    if(!Number.isSafeInteger(expected)||expected>64*1024*1024)
      throw new RangeError("TIFF block exceeds safety limit");
    const offset=offsets[block]!,length=lengths[block]!;
    const compressed=checkedSlice(bytes,offset,length);
    const raw=compression===1?compressed:await inflateDeflate(compressed,expected);
    if(raw.byteLength<expected)throw new RangeError("Truncated decoded TIFF tile/strip");
    if(raw.byteLength>expected)throw new RangeError("Decoded TIFF block size exceeds expected allocation");
    const buf=new Uint8Array(raw); // clone before applying predictor
    if(predictor===2)undoHorizontalPredictor(buf,blockWidth,physicalHeight,bps,tiff.littleEndian);
    const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
    for(let row=0;row<usedHeight;row++)for(let col=0;col<Math.min(blockWidth,width-blockCol*blockWidth);col++){
      const offset=(row*blockWidth+col)*bytesPerSample;
      const value=readSample(dv,offset,bps,sampleFormat,tiff.littleEndian);
      output[(blockRow*blockHeight+row)*width+blockCol*blockWidth+col]=
        useNodata&&value===nodata?NaN:value;
    }
  }
  const grid:RasterGrid={
    width,height,crs,transform,values:output,
    source:"decoded-geotiff",unit:"native-sample",
  };
  validateRaster(grid);
  return grid;
}
function checkedSlice(bytes:Uint8Array,offset:number,length:number):Uint8Array {
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<=0||offset+length>bytes.byteLength)
    throw new RangeError("Invalid or out-of-bounds TIFF data range");
  return bytes.subarray(offset,offset+length);
}
async function inflateDeflate(data:Uint8Array,expected:number):Promise<Uint8Array>{
  if(typeof DecompressionStream==="undefined")throw new Error("Deflate GeoTIFF requires standard DecompressionStream");
  // Compression=8 is zlib-wrapped Deflate per TIFF/Adobe Tech Note 2.
  const stream=new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader=stream.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>expected){await reader.cancel();throw new RangeError("Decompressed TIFF block exceeds expected size");}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const out=new Uint8Array(total);
  let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength;}
  return out;
}
function undoHorizontalPredictor(bytes:Uint8Array,width:number,height:number,bits:number,little:boolean):void {
  const step=bits/8,mask=2**bits;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let row=0;row<height;row++)for(let col=1;col<width;col++){
    const current=(row*width+col)*step,previous=current-step;
    const prev=unsigned(view,previous,bits,little);
    const delta=unsigned(view,current,bits,little);
    const sum=(prev+delta)%mask;
    if(bits===8)view.setUint8(current,sum);
    else if(bits===16)view.setUint16(current,sum,little);
    else view.setUint32(current,sum,little);
  }
}
function unsigned(view:DataView,offset:number,bits:number,little:boolean):number {
  return bits===8?view.getUint8(offset):bits===16?view.getUint16(offset,little):view.getUint32(offset,little);
}
function readSample(view:DataView,offset:number,bits:number,format:SampleKind,little:boolean):number {
  if(format===3)return bits===32?view.getFloat32(offset,little):view.getFloat64(offset,little);
  if(format===2)return bits===8?view.getInt8(offset):bits===16?view.getInt16(offset,little):view.getInt32(offset,little);
  return unsigned(view,offset,bits,little);
}
function readCrs(tiff:TiffDirectory):RasterCrs{
  const keys=tiff.numbers(34735);
  if(!keys||keys.length<4)throw new RangeError("Missing GeoTIFF GeoKeyDirectory: CRS must be explicit");
  const total=keys[3]!;
  if(!Number.isSafeInteger(total)||total>1024||keys.length<4+total*4)
    throw new RangeError("Invalid GeoKeyDirectory");
  let epsg:number|undefined;
  for(let i=0;i<total;i++){
    const start=4+i*4,key=keys[start]!,tagLocation=keys[start+1]!,count=keys[start+2]!,value=keys[start+3]!;
    if((key===2048||key===3072)&&tagLocation===0&&count===1)epsg=value;
  }
  if(epsg!==4326&&epsg!==3857)
    throw new RangeError("GeoTIFF CRS is missing or unsupported: only EPSG:4326 / EPSG:3857 are supported");
  return `EPSG:${epsg}` as RasterCrs;
}
function readTransform(tiff:TiffDirectory):RasterTransform{
  const mat=tiff.numbers(34264);
  if(mat){
    if(mat.length!==16||Math.abs(mat[12]!)>1e-12||Math.abs(mat[13]!)>1e-12||Math.abs(mat[14]!)>1e-12||Math.abs(mat[15]!-1)>1e-12)
      throw new RangeError("Unsupported non-affine GeoTIFF model transformation");
    return [mat[3]!,mat[0]!,mat[1]!,mat[7]!,mat[4]!,mat[5]!];
  }
  const scale=tiff.numbers(33550),tie=tiff.numbers(33922);
  if(!scale||scale.length<2||!tie||tie.length<6||!(scale[0]!>0&&scale[1]!>0))
    throw new RangeError("Missing GeoTIFF pixel scale or model tiepoint");
  return [tie[3]!-tie[0]!*scale[0]!,scale[0]!,0,
          tie[4]!+tie[1]!*scale[1]!,0,-scale[1]!];
}
class TiffDirectory {
  readonly littleEndian:boolean;
  readonly view:DataView;
  readonly tags=new Map<number,TiffValue>();
  private readonly bytes:Uint8Array;
  constructor(bytes:Uint8Array){
    this.bytes=bytes;
    if(bytes.length<16)throw new RangeError("GeoTIFF header too short");
    this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const signature=String.fromCharCode(bytes[0]!,bytes[1]!);
    if(signature!=="II"&&signature!=="MM")throw new RangeError("Not a TIFF (byte order marker)");
    this.littleEndian=signature==="II";
    const magic=this.view.getUint16(2,this.littleEndian);
    let big=false,position=0,count=0,entrySize=0,inline=0;
    if(magic===42){position=this.view.getUint32(4,this.littleEndian);count=this.u16(position);position+=2;entrySize=12;inline=4;}
    else if(magic===43){
      if(this.u16(4)!==8||this.u16(6)!==0)throw new RangeError("Invalid BigTIFF offset-size header");
      position=this.u64(8);count=this.u64(position);position+=8;entrySize=20;inline=8;big=true;
    } else throw new RangeError("Not classic TIFF/BigTIFF");
    if(!Number.isSafeInteger(count)||count<1||count>4096||position+count*entrySize>bytes.length)
      throw new RangeError("Invalid TIFF IFD");
    for(let i=0;i<count;i++){
      const base=position+i*entrySize;
      const tag=this.u16(base),type=this.u16(base+2);
      const items=big?this.u64(base+4):this.view.getUint32(base+4,this.littleEndian);
      const elementSize=BYTE_SIZE[type];
      if(!elementSize||!Number.isSafeInteger(items)||items<0||items*elementSize>16*1024*1024)
        throw new RangeError("Unsupported/oversized TIFF tag");
      const fieldPosition=base+(big?12:8);
      const offset=items*elementSize<=inline ? fieldPosition :
        big ? this.u64(fieldPosition) : this.view.getUint32(fieldPosition,this.littleEndian);
      if(offset<0||offset+items*elementSize>bytes.length)
        throw new RangeError("TIFF tag data lies outside supplied bytes");
      this.tags.set(tag,{type,count:items,dataOffset:offset});
    }
  }
  u16(offset:number):number{
    if(offset<0||offset+2>this.bytes.length)throw new RangeError("Truncated TIFF offset");
    return this.view.getUint16(offset,this.littleEndian);
  }
  u64(offset:number):number{
    if(offset<0||offset+8>this.bytes.length)throw new RangeError("Truncated BigTIFF offset");
    const v=this.view.getBigUint64(offset,this.littleEndian);
    if(v>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError("BigTIFF offset exceeds JavaScript exact integer range");
    return Number(v);
  }
  numbers(tag:number):number[]|undefined{
    const def=this.tags.get(tag);if(!def)return undefined;
    if(def.type===2)throw new RangeError("Expected numeric TIFF tag, got ASCII");
    if(def.count>1_000_000)throw new RangeError("TIFF tag numeric list too large");
    const out:number[]=[];
    const little=this.littleEndian,view=this.view,bytes=BYTE_SIZE[def.type]!;
    for(let i=0;i<def.count;i++){
      const off=def.dataOffset+i*bytes;
      let value:number;
      switch(def.type){
        case 1:case 7:value=view.getUint8(off);break;
        case 3:value=view.getUint16(off,little);break;
        case 4:value=view.getUint32(off,little);break;
        case 8:value=view.getInt16(off,little);break;
        case 9:value=view.getInt32(off,little);break;
        case 11:value=view.getFloat32(off,little);break;
        case 12:value=view.getFloat64(off,little);break;
        case 16:case 18:value=this.u64(off);break;
        case 17:{const n=view.getBigInt64(off,little);if(n<BigInt(Number.MIN_SAFE_INTEGER)||n>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError("SLONG8 overflow");value=Number(n);break;}
        default:throw new RangeError("Unsupported numeric TIFF tag type "+def.type);
      }
      out.push(value);
    }
    return out;
  }
  scalar(tag:number,fallback?:number):number{
    const data=this.numbers(tag);
    if(!data||data.length===0){
      if(fallback!==undefined)return fallback;
      throw new RangeError("Required GeoTIFF tag absent: "+tag);
    }
    return data[0]!;
  }
  ascii(tag:number):string|undefined{
    const def=this.tags.get(tag);if(!def)return undefined;
    if(def.type!==2)throw new RangeError("Invalid TIFF ASCII type");
    return new TextDecoder("ascii").decode(this.bytes.subarray(def.dataOffset,def.dataOffset+def.count)).replace(/\0+$/,"");
  }
}
