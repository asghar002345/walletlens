import { Usage } from "../models/usage.js";
import type { ProviderCaps } from "../config.js";

export class QuotaExceededError extends Error {
  constructor(
    public provider: string,
    public window: "minute" | "day",
  ) {
    super(`${provider} ${window} cap reached`);
  }
}

/**
 * Reserve one call against a provider's per-minute and per-day caps.
 * Counters live in Mongo so caps hold across restarts and multiple instances.
 */
export async function reserve(provider: string, caps: ProviderCaps, now = new Date()) {
  const iso = now.toISOString();
  const windows = [
    { window: "minute" as const, bucket: `m:${iso.slice(0, 16)}`, max: caps.perMinute, ttl: 120_000 },
    { window: "day" as const, bucket: `d:${iso.slice(0, 10)}`, max: caps.perDay, ttl: 2 * 86_400_000 },
  ];
  const incremented: string[] = [];
  for (const w of windows) {
    const doc = await Usage.findOneAndUpdate(
      { provider, bucket: w.bucket },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now.getTime() + w.ttl) } },
      { upsert: true, returnDocument: "after" },
    );
    incremented.push(w.bucket);
    if (doc.count > w.max) {
      // Roll back so a rejected call doesn't burn quota.
      await Usage.updateMany({ provider, bucket: { $in: incremented } }, { $inc: { count: -1 } });
      throw new QuotaExceededError(provider, w.window);
    }
  }
}

export async function usageToday(provider: string, now = new Date()) {
  const doc = await Usage.findOne({ provider, bucket: `d:${now.toISOString().slice(0, 10)}` });
  return doc?.count ?? 0;
}
