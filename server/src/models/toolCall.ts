import { Schema, model } from "mongoose";
import { createMemoryModel, isMemoryStore } from "./memoryStore.js";

/** Audit log: every tool call the LLM makes (and its Zod-validated args) is stored. */
const toolCallSchema = new Schema(
  {
    analysisId: { type: Schema.Types.ObjectId, ref: "Analysis", required: true, index: true },
    tool: { type: String, required: true },
    args: { type: Schema.Types.Mixed, required: true },
    ok: { type: Boolean, required: true },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    latencyMs: { type: Number, required: true },
    cached: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const mongooseToolCall = model("ToolCall", toolCallSchema);
/** Real Mongoose model, or the in-process demo store when WALLETLENS_STORE=memory (Vercel demo). */
export const ToolCall = isMemoryStore()
  ? (createMemoryModel({ timestamps: true, defaults: () => ({ cached: false }) }) as unknown as typeof mongooseToolCall)
  : mongooseToolCall;
