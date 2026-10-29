import { CacheEntry } from "../models/cache.js";

export async function cached<T>(
  key: string,
  ttlSec: number,
  load: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const hit = await CacheEntry.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
  if (hit) return { value: hit.value as T, hit: true };
  const value = await load();
  if (value !== null && value !== undefined) {
    await CacheEntry.updateOne({ key }, { value, expiresAt: new Date(Date.now() + ttlSec * 1000) }, { upsert: true });
  }
  return { value, hit: false };
}
