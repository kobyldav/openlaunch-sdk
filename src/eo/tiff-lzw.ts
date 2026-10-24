/**
 * TIFF 6.0 Compression=5 LZW: MSB-first, clear=256, EOI=257, widths 9..12.
 * TIFF EarlyChange=1. Bounded output, dictionary and malformed-input guards.
 * JP2/JPEG2000 is a different format and is not supported by this module.
 */
export function decodeTiffLzw(compressed:Uint8Array,expectedBytes:number):Uint8Array {
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>64*1024*1024)
    throw new RangeError("Invalid bounded TIFF LZW decoded size");
  if(!(compressed instanceof Uint8Array)||compressed.length===0)
    throw new RangeError("Empty TIFF LZW block");
  const out=new Uint8Array(expectedBytes),prefix=new Int16Array(4096),
    suffix=new Uint8Array(4096),stack=new Uint8Array(4097);
  let pos=0,buffer=0,bits=0,cursor=0,width=9,nextCode=258,previous=-1,previousFirst=0,clearSeen=false;
  const readCode=():number=>{
    while(bits<width) {
      if(cursor>=compressed.length)throw new RangeError("Truncated TIFF LZW code stream");
      buffer=(buffer<<8)|compressed[cursor++]!;bits+=8;
    }
    bits-=width;
    const value=(buffer>>>bits)&((1<<width)-1);
    buffer&=(1<<bits)-1;
    return value;
  };
  const expand=(entry:number):number=>{
    let length=0;
    while(entry>=256) {
      if(entry>=nextCode||length>=4096)
        throw new RangeError("Invalid TIFF LZW dictionary reference");
      stack[length++]=suffix[entry]!;
      entry=prefix[entry]!;
    }
    stack[length++]=entry;
    return length;
  };
  while(true){
    const current=readCode();
    if(current===256){width=9;nextCode=258;previous=-1;clearSeen=true;continue;}
    if(!clearSeen)throw new RangeError("TIFF LZW missing initial clear code");
    if(current===257)break;
    if(current>nextCode||(current===nextCode&&previous<0))
      throw new RangeError("Invalid TIFF LZW forward dictionary reference");
    const special=current===nextCode,length=expand(special?previous:current),first=stack[length-1]!;
    if(pos+length+(special?1:0)>expectedBytes)
      throw new RangeError("TIFF LZW expansion exceeds expected block size");
    for(let i=length-1;i>=0;i--)out[pos++]=stack[i]!;
    if(special)out[pos++]=previousFirst;
    if(previous>=0&&nextCode<4096){
      prefix[nextCode]=previous;suffix[nextCode]=first;nextCode++;
      if(nextCode===(1<<width)-1&&width<12)width++;
    }
    previous=current;previousFirst=first;
  }
  if(pos!==expectedBytes)throw new RangeError("TIFF LZW decoded byte count does not match expected block size");
  return out;
}
