import {readFile,writeFile,rename,mkdir,rm} from "node:fs/promises";
import {dirname,join} from "node:path";

const MAX_BYTES=15_000_000;
function validTiff(bytes){
  return bytes && bytes.length>=64 && bytes.length<=MAX_BYTES &&
    ((bytes[0]===0x49 && bytes[1]===0x49 && bytes[2]===42 && bytes[3]===0) ||
     (bytes[0]===0x4d && bytes[1]===0x4d && bytes[2]===0 && bytes[3]===42));
}
async function readValid(file){
  const bytes=await readFile(file).catch(error=>{
    if(error.code==="ENOENT")return null;
    throw error;
  });
  if(bytes&&!validTiff(bytes)){await rm(file,{force:true});return null;}
  return bytes;
}
async function atomicWrite(file,bytes){
  await mkdir(dirname(file),{recursive:true});
  const temporary=file+".partial-"+process.pid;
  try{
    await writeFile(temporary,bytes);
    await rename(temporary,file);
  }finally{
    await rm(temporary,{force:true}).catch(()=>{});
  }
}
/** Retry only remote sensor TIFF downloads. Local and shared caches are checked
 * before networking. Each download must have a valid TIFF signature, nonzero
 * length and a bounded size; partial responses never enter the cache.
 * This is infrastructure only. No reference DEM enters the reconstruction.
 */
export async function downloadS2pAsset({
  base,sourcePath,out,name,cacheDir,fetchImpl=fetch,attempts=3,
  timeoutMs=120_000,retryDelayMs=300
}){
  if(typeof sourcePath!=="string"||!/^((input_(pair|triplet))\/img_0[123]\.tif|expected_output\/(pair|triplet)\/dsm\.tif)$/.test(sourcePath)||
    typeof name!=="string"||!/^[a-z0-9][a-z0-9._-]*\.tif$/i.test(name)||
    !Number.isInteger(attempts)||attempts<1||attempts>5||
    !Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>600_000||
    !Number.isFinite(retryDelayMs)||retryDelayMs<0||retryDelayMs>10_000)
    throw new RangeError("Invalid S2P asset download options");
  const local=join(out,name),shared=cacheDir?join(cacheDir,sourcePath):null;
  const localData=await readValid(local);
  if(localData){
    if(shared&&!(await readValid(shared)))await atomicWrite(shared,localData);
    return localData;
  }
  if(shared){
    const cached=await readValid(shared);
    if(cached){await atomicWrite(local,cached);return cached;}
  }
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetchImpl(base+sourcePath,{signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok){
        const failure=new Error("S2P download "+sourcePath+" HTTP "+response.status);
        if(response.status>=400&&response.status<500&&response.status!==408&&response.status!==429)
          throw Object.assign(failure,{noRetry:true});
        throw failure;
      }
      const bytes=Buffer.from(await response.arrayBuffer());
      if(!validTiff(bytes))throw new Error("S2P download "+sourcePath+" was not a valid bounded TIFF");
      if(shared)await atomicWrite(shared,bytes);
      await atomicWrite(local,bytes);
      return bytes;
    }catch(error){
      lastError=error;
      if(error.noRetry||attempt===attempts)break;
      if(retryDelayMs)await new Promise(resolve=>setTimeout(resolve,retryDelayMs*attempt));
    }
  }
  throw new Error("S2P asset "+sourcePath+" unavailable after "+attempts+" attempts; cached data were not corrupted",{cause:lastError});
}
