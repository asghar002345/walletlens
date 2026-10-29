import { Schema, model, type InferSchemaType } from "mongoose";

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
export const Knowledge = model("Knowledge", knowledgeSchema, "knowledge");
