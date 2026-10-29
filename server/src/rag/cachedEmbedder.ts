import { createHash } from "node:crypto";
import { CacheEntry } from "../models/cache.js";
import type { ProviderCaps } from "../config.js";
import { reserve } from "../services/quota.js";
import type { EmbedTask, Embedder } from "./types.js";

const TTL_MS = 30 * 86_400_000;

/**
 * Caches embeddings in Mongo by (model, task, text hash), and reserves free-tier quota only for the
 * texts that actually need a network call. Throws QuotaExceededError when the cap is hit.
 */
export class CachedEmbedder implements Embedder {
  constructor(
    private inner: Embedder,
    private caps: ProviderCaps,
    private provider = "geminiEmbed",
  ) {}
  get name() {
    return this.inner.name;
  }
  get dims() {
    return this.inner.dims;
  }

  async embed(texts: string[], task: EmbedTask) {
    const keys = texts.map((t) => `emb:${this.inner.name}:${task}:${createHash("sha256").update(t).digest("hex")}`);
    const hits = await CacheEntry.find({ key: { $in: keys }, expiresAt: { $gt: new Date() } }).lean();
    const byKey = new Map(hits.map((h) => [h.key, h.value as number[]]));
    const missing = texts.map((t, i) => ({ t, key: keys[i] })).filter((m) => !byKey.has(m.key));
    if (missing.length > 0) {
      await reserve(this.provider, this.caps);
      const vectors = await this.inner.embed(
        missing.map((m) => m.t),
        task,
      );
      await CacheEntry.bulkWrite(
        missing.map((m, i) => ({
          updateOne: {
            filter: { key: m.key },
            update: { value: vectors[i], expiresAt: new Date(Date.now() + TTL_MS) },
            upsert: true,
          },
        })),
      );
      missing.forEach((m, i) => byKey.set(m.key, vectors[i]));
    }
    return keys.map((k) => byKey.get(k)!);
  }
}
