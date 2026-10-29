import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Knowledge } from "../models/knowledge.js";
import { noteText, type Embedder } from "./types.js";

const NOTES_FILE = fileURLToPath(new URL("../../knowledge/notes.json", import.meta.url));

export const noteSchema = z.object({
  noteId: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  tags: z.array(z.string()).min(1),
  body: z.string().min(40),
  sources: z.array(z.string().url()).min(1),
});
export type Note = z.infer<typeof noteSchema>;

export const loadNotes = (file = NOTES_FILE): Note[] =>
  z.array(noteSchema).parse(JSON.parse(readFileSync(file, "utf8")));

/**
 * Upsert the curated notes into the `knowledge` collection. If an embedder is given (live mode), embed
 * only notes whose content changed since they were last embedded, so re-seeding costs no quota.
 */
export async function seedKnowledge(embedder?: Embedder, notes = loadNotes()) {
  const hashOf = (n: Note) =>
    createHash("sha256")
      .update(noteText(n) + n.sources.join())
      .digest("hex");
  await Knowledge.bulkWrite(
    notes.map((n) => ({
      updateOne: { filter: { noteId: n.noteId }, update: { $set: { ...n, contentHash: hashOf(n) } }, upsert: true },
    })),
  );
  await Knowledge.deleteMany({ noteId: { $nin: notes.map((n) => n.noteId) } });

  let embedded = 0;
  if (embedder) {
    const stale = await Knowledge.find({
      $or: [{ embeddingModel: { $ne: embedder.name } }, { $expr: { $ne: ["$embeddedHash", "$contentHash"] } }],
    }).lean();
    for (let i = 0; i < stale.length; i += 20) {
      const batch = stale.slice(i, i + 20);
      const vectors = await embedder.embed(batch.map(noteText), "document");
      await Knowledge.bulkWrite(
        batch.map((d, j) => ({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: { embedding: vectors[j], embeddingModel: embedder.name, embeddedHash: d.contentHash } },
          },
        })),
      );
      embedded += batch.length;
    }
  }
  return { notes: notes.length, embedded };
}
