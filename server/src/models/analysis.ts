import { Schema, model, type InferSchemaType } from "mongoose";

export const INPUT_KINDS = ["tx", "address", "signRequest"] as const;

const analysisSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    chainId: { type: Number, required: true },
    input: {
      kind: { type: String, enum: INPUT_KINDS, required: true },
      value: { type: String }, // tx hash or address
      request: { type: Schema.Types.Mixed }, // unsigned eth_sendTransaction params (never signed)
    },
    chainData: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ["pending", "complete", "failed"], default: "pending" },
    // Filled by the tool loop + structured verdict milestones.
    verdict: { type: Schema.Types.Mixed, default: null },
    // Tool-loop trace: per-step provider, model, latency, tokens and tool calls, plus the draft answer.
    trace: { type: Schema.Types.Mixed, default: null },
    mode: { type: String, enum: ["mock", "live"], required: true },
    notices: { type: [String], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_d, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  },
);

export type AnalysisDoc = InferSchemaType<typeof analysisSchema>;
export const Analysis = model("Analysis", analysisSchema);
