/** Optional shared image storage. Implement with Cloudflare KV, Redis or other backends.
 * Keys are canonical EUMETView WMS URLs, always containing an explicit TIME.
 * Storage records must be treated as untrusted: the SDK revalidates MIME, image
 * signature, expiry and payload size after every read. */
export interface MeteosatSharedImageRecord {
  image: Uint8Array;
  contentType: string;
  expiresAt: number;
}
export interface MeteosatSharedImageStore {
  get(key: string): Promise<MeteosatSharedImageRecord | null>;
  put(key: string, record: MeteosatSharedImageRecord): Promise<void>;
}
