import { type RasterCrs, type RasterGrid, type RasterTransform, validateRaster } from "./raster.js";

/** A one-band 8-bit decoded JPEG2000 image; not raw codestream or mock RGB. */
export interface Jp2Image { width:number; height:number; components:1; values:Uint8Array; }
export interface Jp2DecoderBackend { decode(bytes:Uint8Array):Promise<Jp2Image>; }
export interface Jp2Header {width:number;height:number;components:number;bitsPerComponent:number;}
export interface Jp2Limits {maxBytes?:number;maxPixels?:number;}
export interface Jp2RasterReference {
  crs:RasterCrs;
  transform:RasterTransform;
  shape:readonly [number,number]; // [height,width] from exact STAC asset metadata
}
const SIG=[0,0,0,12,106,80,32,32,13,10,135,10];
export function readJp2Header(bytes:Uint8Array):Jp2Header {
  if(!(bytes instanceof Uint8Array)||bytes.length<48||!SIG.every((v,i)=>bytes[i]===v))
    throw new RangeError("JP2 signature box missing; raw J2K codestream is not a JP2 file");
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u32=(off:number)=>dv.getUint32(off,false);
  let offset=12,seen=false;
  while(offset+8<=bytes.length) {
    const length=u32(offset),type=u32(offset+4);
    if(length===1||length===0||length<8||offset+length>bytes.length)
      throw new RangeError("Unsupported or truncated JP2 box length");
    // JP2 Header superbox: recursively find Image Header (ihdr).
    if(type===0x6a703268) {
      if(seen)throw new RangeError("Duplicate JP2 header");
      seen=true;
      let child=offset+8;
      while(child+8<=offset+length) {
        const size=u32(child),kind=u32(child+4);
        if(size<8||child+size>offset+length)throw new RangeError("Invalid JP2 image header box");
        if(kind===0x69686472) {
          if(size<22)throw new RangeError("Truncated JP2 ihdr");
          const height=u32(child+8),width=u32(child+12);
          const components=dv.getUint16(child+16,false);
          const bpc=bytes[child+18]!;
          if(!height||!width||!components||bpc===255)
            throw new RangeError("Unsupported JP2 precision/size header");
          return {width,height,components,bitsPerComponent:(bpc&127)+1};
        }
        child+=size;
      }
    }
    offset+=length;
  }
  throw new RangeError("JP2 image header missing");
}
/**
 * Fail closed if the image is huge or the codec yields different pixels from
 * the untrusted JP2 container header. Decoder must be explicitly injected.
 */
export async function decodeJp2Raster(
 bytes:Uint8Array,reference:Jp2RasterReference,backend:Jp2DecoderBackend,
 options:Jp2Limits={}
):Promise<RasterGrid> {
 const maxBytes=options.maxBytes??2*1024*1024,maxPixels=options.maxPixels??1_048_576;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<48||maxBytes>8*1024*1024)
   throw new RangeError("JP2 maxBytes must be 48..8388608");
 if(!Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>4_194_304)
   throw new RangeError("JP2 maxPixels must be 1..4194304");
 if(bytes.length>maxBytes)throw new RangeError("JP2 bytes exceed configured download/decode budget");
 const header=readJp2Header(bytes);
 if(header.components!==1||header.bitsPerComponent!==8)
   throw new RangeError("Only 8-bit single-band JP2 classification masks supported");
 if(header.width*header.height>maxPixels||!Number.isSafeInteger(header.width*header.height))
   throw new RangeError("JP2 pixel dimensions exceed maxPixels");
 if(!Array.isArray(reference.shape)||reference.shape[0]!==header.height||reference.shape[1]!==header.width)
   throw new RangeError("Exact JP2 asset proj:shape does not match image");
 if(!Array.isArray(reference.transform)||reference.transform.length!==6||reference.transform.some(v=>!Number.isFinite(v)))
   throw new RangeError("Missing or invalid JP2 asset proj:transform");
 if(!backend||typeof backend.decode!=="function")
   throw new TypeError("A configured JP2 decoder backend is required");
 let result:Jp2Image;
 try{result=await backend.decode(bytes);}
 catch{throw new Error("JP2 codec rejected the image");}
 if(result.width!==header.width||result.height!==header.height||
    result.components!==1||!(result.values instanceof Uint8Array)||
    result.values.length!==header.width*header.height)
   throw new RangeError("JP2 decoder dimensions or sample representation do not match source");
 const out:RasterGrid={width:header.width,height:header.height,crs:reference.crs,
  transform:reference.transform,values:Float64Array.from(result.values),source:"decoded-jp2-scl",unit:"SCL-class"};
 validateRaster(out);
 return out;
}

/**
 * Optional bridge for the @cornerstonejs/codec-openjpeg OpenJPEG WebAssembly
 * factory. Pass the factory from the app's explicitly installed codec; SDK
 * does not fetch unreviewed WASM over the network or bundle opaque binaries.
 * Use an isolated worker/process with memory limits for untrusted assets.
 */
export function createOpenJpegWasmBackend(factory:()=>Promise<{
 J2KDecoder:new()=>{
  getEncodedBuffer(n:number):Uint8Array;
  readHeader?():unknown;
  decode():void;
  getDecodedBuffer():Uint8Array|ArrayBuffer;
  getFrameInfo():{width:number;height:number;componentCount?:number;bitsPerSample?:number;isSigned?:boolean};
  delete?():void;
 };
}>):Jp2DecoderBackend {
 if(typeof factory!=="function")throw new TypeError("OpenJPEG factory required");
 return {async decode(bytes) {
  let codec:Awaited<ReturnType<typeof factory>>;
  try{codec=await factory();}catch{throw new Error("OpenJPEG WASM unavailable");}
  const instance=new codec.J2KDecoder();
  try{
    const encoded=instance.getEncodedBuffer(bytes.length);
    if(!(encoded instanceof Uint8Array)||encoded.byteLength<bytes.length)
      throw new RangeError("OpenJPEG encoded buffer unavailable");
    encoded.set(bytes);
    // OpenJPEG decode() parses the header itself. Calling readHeader()
    // first may consume the input stream and break a second decode pass.
    instance.decode();
    const info=instance.getFrameInfo();
    if(!info||!Number.isSafeInteger(info.width)||!Number.isSafeInteger(info.height)||
       info.width<1||info.height<1||
       (info.componentCount!==undefined&&info.componentCount!==1)||
       (info.bitsPerSample!==undefined&&info.bitsPerSample!==8)||
       (info.isSigned!==undefined&&info.isSigned!==false))
      throw new RangeError("OpenJPEG decoded format is not one unsigned 8-bit component");
    const buffer=instance.getDecodedBuffer();
    // Emscripten may return a typed_memory_view from a separate JS realm.
    // ArrayBuffer.isView() works cross-realm whereas instanceof Uint8Array
    // is not guaranteed. Never reinterpret 16-bit/signed words as SCL bytes.
    let values:Uint8Array;
    if(ArrayBuffer.isView(buffer)){
      const view=buffer as ArrayBufferView & {BYTES_PER_ELEMENT?:number};
      if(view.BYTES_PER_ELEMENT!==1||view.byteLength!==info.width*info.height)
        throw new RangeError("OpenJPEG decoded buffer has unsupported sample width or dimensions");
      values=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
    }else if(Object.prototype.toString.call(buffer)==="[object ArrayBuffer]"){
      const raw=buffer as ArrayBuffer;
      if(raw.byteLength!==info.width*info.height)
        throw new RangeError("OpenJPEG decoded ArrayBuffer length differs from frame");
      values=new Uint8Array(raw);
    }else{
      throw new TypeError("OpenJPEG returned an unsupported pixel buffer");
    }
    // Copy from WASM memory BEFORE destructor (typed_memory_view becomes dangling).
    return {width:info.width,height:info.height,components:1,
      values:Uint8Array.from(values)};
  }finally{instance.delete?.();}
 }};
}
