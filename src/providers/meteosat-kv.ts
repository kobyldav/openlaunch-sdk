import { EUMETVIEW_WMS } from "./meteosat.js";
import type { MeteosatSharedImageStore, MeteosatSharedImageRecord } from "./meteosat-cache-store.js";

/** Minimal structural KV interface: no Cloudflare-specific dependency in @openlaunch/earth. */
export interface MeteosatKvNamespace {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer, options: { expirationTtl: number }): Promise<void>;
}
export interface MeteosatKvOptions {
  /** Namespace prefix for isolating deployments within a KV binding. */
  prefix?: string;
  /** Used for deterministic tests. Real requests should use system time. */
  now?: () => number;
}
const magic = [79, 76, 77, 49]; // OLM1
const headerSize = 13;

function encode(record: MeteosatSharedImageRecord): ArrayBuffer {
  const type = /^image\/png(?:;|$)/i.test(record.contentType.trim()) ? 1
    : /^image\/(?:jpeg|jpg)(?:;|$)/i.test(record.contentType.trim()) ? 2 : 0;
  if (!type || !Number.isSafeInteger(record.expiresAt) || record.expiresAt < 1)
    throw new RangeError("Invalid Meteosat KV cache entry");
  const buffer = new ArrayBuffer(headerSize + record.image.byteLength);
  const bytes = new Uint8Array(buffer);
  bytes.set(magic, 0);
  bytes[4] = type;
  new DataView(buffer).setBigUint64(5, BigInt(record.expiresAt), false);
  bytes.set(record.image, headerSize);
  return buffer;
}
function decode(buffer: ArrayBuffer): MeteosatSharedImageRecord | null {
  if (buffer.byteLength < headerSize + 3 || buffer.byteLength > 8 * 1024 * 1024 + headerSize) return null;
  const bytes = new Uint8Array(buffer);
  if (!magic.every((b,i)=>bytes[i]===b)) return null;
  const type = bytes[4];
  if (type !== 1 && type !== 2) return null;
  const epoch = Number(new DataView(buffer).getBigUint64(5, false));
  if (!Number.isSafeInteger(epoch)) return null;
  return {image: bytes.slice(headerSize),
    contentType:type===1?"image/png":"image/jpeg",expiresAt:epoch};
}

/**
 * Cloudflare Workers KV adapter for a shared Meteosat image store.
 * Uses SHA-256 of official WMS URL as key, not a user-controlled URL fetch.
 * KV is eventually consistent, so concurrent misses across edge locations can
 * still download the same frame. Call through SDK on the backend, never publicly.
 */
export class MeteosatCloudflareKvStore implements MeteosatSharedImageStore {
  private readonly prefix: string;
  private readonly now: () => number;
  constructor(private readonly kv: MeteosatKvNamespace, options: MeteosatKvOptions={}) {
    const prefix=options.prefix??"openlaunch:meteosat:v1";
    if (!/^[a-zA-Z0-9:_-]{1,96}$/.test(prefix)) throw new RangeError("Invalid KV prefix");
    this.prefix=prefix;
    this.now=options.now??(()=>Date.now());
  }
  async keyFor(url: string): Promise<string> {
    const parsed=new URL(url);
    if (parsed.origin!==new URL(EUMETVIEW_WMS).origin ||
      parsed.pathname!==new URL(EUMETVIEW_WMS).pathname ||
      parsed.searchParams.get("REQUEST")!=="GetMap" ||
      !parsed.searchParams.has("TIME"))
      throw new TypeError("Expected an official, explicitly timed EUMETView GetMap URL");
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto required for WMS cache keys");
    const sum=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(url));
    const hex=[...new Uint8Array(sum)].map(x=>x.toString(16).padStart(2,"0")).join("");
    return this.prefix+":"+hex;
  }
  async get(key: string): Promise<MeteosatSharedImageRecord | null> {
    const data=await this.kv.get(await this.keyFor(key),"arrayBuffer");
    return data===null?null:decode(data);
  }
  async put(key: string, record: MeteosatSharedImageRecord): Promise<void> {
    const remaining=record.expiresAt-this.now();
    if (!(remaining>0)) return;
    // Cloudflare KV expirationTtl requires at least 60 seconds; the record's
    // own expiresAt enforces shorter logical expiry even under KV propagation.
    const expirationTtl=Math.max(60,Math.ceil(remaining/1000));
    if (record.image.byteLength>8*1024*1024) return;
    await this.kv.put(await this.keyFor(key),encode(record),{expirationTtl});
  }
}
