import { Schema, model } from "mongoose";
import { createMemoryModel, isMemoryStore } from "./memoryStore.js";

/** One counter document per provider per time bucket (minute or day). TTL cleans old buckets. */
const usageSchema = new Schema({
  provider: { type: String, required: true },
  bucket: { type: String, required: true }, // e.g. "m:2026-10-29T18:20" or "d:2026-10-29"
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
usageSchema.index({ provider: 1, bucket: 1 }, { unique: true });
usageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const mongooseUsage = model("Usage", usageSchema);
/** Real Mongoose model, or the in-process demo store when WALLETLENS_STORE=memory (Vercel demo). */
export const Usage = isMemoryStore()
  ? (createMemoryModel({ defaults: () => ({ count: 0 }) }) as unknown as typeof mongooseUsage)
  : mongooseUsage;
