import { Schema, model } from "mongoose";
import { createMemoryModel, isMemoryStore } from "./memoryStore.js";

/** Generic key/value cache (tx lookups now, embeddings later). Mongo TTL index expires entries. */
const cacheSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const mongooseCacheEntry = model("CacheEntry", cacheSchema);
/** Real Mongoose model, or the in-process demo store when WALLETLENS_STORE=memory (Vercel demo). */
export const CacheEntry = isMemoryStore()
  ? (createMemoryModel({}) as unknown as typeof mongooseCacheEntry)
  : mongooseCacheEntry;
