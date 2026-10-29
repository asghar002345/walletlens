import { Router } from "express";
import { Knowledge } from "../models/knowledge.js";
import { HttpError } from "../middleware/errors.js";

/** Public read-only view of the curated notes, so citations can link to their full text. */
export function knowledgeRouter() {
  const router = Router();
  router.get("/", async (_req, res) => {
    const notes = await Knowledge.find({}, { _id: 0, noteId: 1, title: 1, tags: 1 }).sort({ noteId: 1 }).lean();
    res.json({ notes });
  });
  router.get("/:noteId", async (req, res) => {
    const note = await Knowledge.findOne(
      { noteId: req.params.noteId },
      { _id: 0, noteId: 1, title: 1, body: 1, tags: 1, sources: 1 },
    ).lean();
    if (!note) throw new HttpError(404, "Note not found");
    res.json({ note });
  });
  return router;
}
