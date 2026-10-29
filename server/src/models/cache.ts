import { Schema, model } from "mongoose";

/** Generic key/value cache (tx lookups now, embeddings later). Mongo TTL index expires entries. */
const cacheSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CacheEntry = model("CacheEntry", cacheSchema);
