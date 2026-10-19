import { meteosatWmsMapUrl, type MeteosatClient, type MeteosatMapOptions, type MeteosatMapDescriptor, type MeteosatFrameTimeline, type MeteosatTimelineOptions } from "./meteosat.js";
import { isVerifiedImageBytes } from "./image-validation.js";

/** In-memory cache for validated, explicitly time-stamped EUMETView images. */
export interface MeteosatImageCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxBytes?: number;
}
export type MeteosatImageCacheState = "hit" | "miss" | "coalesced" | "bypass";
export interface MeteosatCachedImage {
  image: Uint8Array;
  contentType: string;
  descriptor: MeteosatMapDescriptor;
  cacheState: MeteosatImageCacheState;
}
export interface MeteosatImageCacheStats {
  entries: number;
  bytes: number;
  pending: number;
  hits: number;
  misses: number;
  coalesced: number;
  evictions: number;
}
type RawImage = Awaited<ReturnType<MeteosatClient["fetchMap"]>>;
interface Entry {
  image: Uint8Array;
  contentType: string;
  descriptor: MeteosatMapDescriptor;
  expiresAt: number;
}

function checkedInteger(value: number, label: string, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new RangeError(label + " is outside its supported bounds");
  return value;
}
function copyDescriptor(source: MeteosatMapDescriptor): MeteosatMapDescriptor {
  return { ...source, coordinateBounds3857: [...source.coordinateBounds3857] };
}

/**
 * Cache is per SDK client / warm server process. Not shared or persistent.
 * Only explicit TIME URLs are retained; default/latest WMS images are never cached.
 * Concurrent identical requests share one upstream call. Never caches errors.
 */
export class MeteosatImageCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<Entry>>();
  private totalBytes = 0;
  private hits = 0;
  private misses = 0;
  private coalesced = 0;
  private evictions = 0;
  private generation = 0;

  constructor(
    private readonly upstream: Pick<MeteosatClient, "fetchMap" | "timeline">,
    options: MeteosatImageCacheOptions = {},
    private readonly now: () => number = () => Date.now(),
  ) {
    this.ttlMs = checkedInteger(options.ttlMs ?? 300_000, "ttlMs", 86_400_000);
    this.maxEntries = checkedInteger(options.maxEntries ?? 24, "maxEntries", 256);
    this.maxBytes = checkedInteger(options.maxBytes ?? 32 * 1024 * 1024, "maxBytes", 128 * 1024 * 1024);
  }

  timeline(options: MeteosatTimelineOptions): Promise<MeteosatFrameTimeline> {
    return this.upstream.timeline(options);
  }

  /** Copies returned image bytes, so browser/backend callers cannot corrupt cached data. */
  async fetchMap(options: MeteosatMapOptions): Promise<MeteosatCachedImage> {
    const descriptor = meteosatWmsMapUrl(options);
    const copiedOptions: MeteosatMapOptions = {
      layer: descriptor.layer,
      bounds3857: [...descriptor.coordinateBounds3857],
      width: descriptor.width, height: descriptor.height,
      ...(options.format ? { format: options.format } : {}),
      ...(descriptor.requestedTime ? { time: descriptor.requestedTime } : {}),
    };
    if (!descriptor.requestedTime) {
      const response = await this.upstream.fetchMap(copiedOptions);
      if (!isVerifiedImageBytes(response.image, response.contentType))
        throw new Error("EUMETView returned invalid image bytes");
      return { image: response.image.slice(), contentType: response.contentType,
        descriptor: copyDescriptor(descriptor), cacheState: "bypass" };
    }
    const key = descriptor.url;
    const now = this.now();
    const existing = this.entries.get(key);
    if (existing && now < existing.expiresAt) {
      this.entries.delete(key);
      this.entries.set(key, existing); // LRU
      this.hits++;
      return this.result(existing, "hit");
    }
    if (existing) this.remove(key);
    const pending = this.inflight.get(key);
    if (pending) {
      this.coalesced++;
      return this.result(await pending, "coalesced");
    }
    this.misses++;
    const generation = this.generation;
    const promise = this.download(copiedOptions, descriptor, key, generation);
    this.inflight.set(key, promise);
    try {
      return this.result(await promise, "miss");
    } finally {
      if (this.inflight.get(key) === promise) this.inflight.delete(key);
    }
  }

  private async download(
    options: MeteosatMapOptions, descriptor: MeteosatMapDescriptor, key: string, generation: number,
  ): Promise<Entry> {
    const response: RawImage = await this.upstream.fetchMap(options);
    if (!isVerifiedImageBytes(response.image, response.contentType))
      throw new Error("EUMETView returned invalid image bytes");
    const image = response.image.slice();
    const entry: Entry = {
      image, contentType: response.contentType,
      descriptor: copyDescriptor(descriptor), expiresAt: this.now() + this.ttlMs,
    };
    // Oversized images are delivered to the requester without cache retention.
    if (this.generation === generation && image.byteLength <= this.maxBytes) {
      while (this.entries.size >= this.maxEntries || this.totalBytes + image.byteLength > this.maxBytes) {
        const first = this.entries.keys().next().value;
        if (first === undefined) break;
        this.remove(first);
        this.evictions++;
      }
      this.entries.set(key, entry);
      this.totalBytes += image.byteLength;
    }
    return entry;
  }

  private result(entry: Entry, cacheState: MeteosatImageCacheState): MeteosatCachedImage {
    return { image: entry.image.slice(), contentType: entry.contentType,
      descriptor: copyDescriptor(entry.descriptor), cacheState };
  }
  private remove(key: string): void {
    const item = this.entries.get(key);
    if (!item) return;
    this.totalBytes -= item.image.byteLength;
    this.entries.delete(key);
  }
  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
    this.generation++; // in-flight requests cannot repopulate cleared cache.
  }
  stats(): MeteosatImageCacheStats {
    return {
      entries: this.entries.size, bytes: this.totalBytes, pending: this.inflight.size,
      hits: this.hits, misses: this.misses, coalesced: this.coalesced, evictions: this.evictions,
    };
  }
}
