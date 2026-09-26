import type { Countdown, ImageRef, Query, QueryValue, VideoRef } from "./types.js";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const get = (obj: unknown, path: string): unknown => {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
};

export const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;
export const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const bool = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;
export const id = (value: unknown): string | number | undefined =>
  typeof value === "string" || typeof value === "number" ? value : undefined;

export const date = (value: unknown): Date | undefined => {
  const text = str(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export function imageFrom(value: unknown): ImageRef | undefined {
  if (!isRecord(value)) return undefined;
  const url = str(value.image_url) ?? str(value.url);
  if (!url) return undefined;
  const result: ImageRef = { url };
  const name = str(value.name);
  const thumbnailUrl = str(value.thumbnail_url);
  const credit = str(value.credit);
  const license = str(get(value, "license.name"));
  if (name) result.name = name;
  if (thumbnailUrl) result.thumbnailUrl = thumbnailUrl;
  if (credit) result.credit = credit;
  if (license) result.license = license;
  return result;
}

export function videosFrom(value: unknown): VideoRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): VideoRef[] => {
    if (!isRecord(item)) return [];
    const url = str(item.url);
    if (!url) return [];
    const video: VideoRef = { url };
    const title = str(item.title);
    const publisher = str(item.publisher);
    const featured = bool(item.featured);
    if (title) video.title = title;
    if (publisher) video.publisher = publisher;
    if (featured !== undefined) video.featured = featured;
    return [video];
  });
}

export function params(query: Query = {}): URLSearchParams {
  const out = new URLSearchParams();
  const append = (key: string, value: QueryValue): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      const compact = value.filter((v) => v !== null && v !== undefined).map(String);
      if (compact.length) out.set(key, compact.join(","));
      return;
    }
    out.set(key, String(value));
  };
  for (const [key, value] of Object.entries(query)) append(key, value);
  return out;
}

export function clampLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function countdown(target: Date, now = new Date()): Countdown {
  const raw = target.getTime() - now.getTime();
  const isPast = raw < 0;
  let total = Math.abs(raw);
  const days = Math.floor(total / 86_400_000); total %= 86_400_000;
  const hours = Math.floor(total / 3_600_000); total %= 3_600_000;
  const minutes = Math.floor(total / 60_000); total %= 60_000;
  const seconds = Math.floor(total / 1000);
  return { totalMs: raw, days, hours, minutes, seconds, isPast };
}
