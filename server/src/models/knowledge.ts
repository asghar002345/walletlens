import { Schema, model, type InferSchemaType } from "mongoose";
import { createMemoryModel, isMemoryStore } from "./memoryStore.js";

/** Curated notes used for retrieval. `embedding` is only filled in live mode (Gemini) for Atlas Vector Search. */
const knowledgeSchema = new Schema(
  {
    noteId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    tags: { type: [String], default: [], index: true },
    sources: { type: [String], default: [] },
    contentHash: { type: String, required: true },
    embedding: { type: [Number], default: undefined, select: false },
    embeddingModel: { type: String },
    embeddedHash: { type: String },
  },
  { timestamps: true },
);

export type KnowledgeDoc = InferSchemaType<typeof knowledgeSchema>;
const mongooseKnowledge = model("Knowledge", knowledgeSchema, "knowledge");
/** Real Mongoose model, or the in-process demo store when WALLETLENS_STORE=memory (Vercel demo). */
export const Knowledge = isMemoryStore()
  ? (createMemoryModel({
      timestamps: true,
      defaults: () => ({ tags: [], sources: [] }),
      hidden: ["embedding"],
    }) as unknown as typeof mongooseKnowledge)
  : mongooseKnowledge;
