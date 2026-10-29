import { Knowledge } from "../models/knowledge.js";
import { QuotaExceededError } from "../services/quota.js";
import { LocalHashEmbedder } from "./localEmbedder.js";
import { cosine, noteText, type Embedder, type RetrievedNote, type RetrieveResult, type Retriever } from "./types.js";

// Below this, hashed keyword overlap is mostly noise (e.g. a single hash collision).
const MIN_SCORE = 0.12;
const toNote = (
  d: { noteId: string; title: string; body: string; sources: string[]; tags: string[] },
  score: number,
) => ({
  noteId: d.noteId,
  title: d.title,
  snippet: d.body,
  sources: d.sources,
  tags: d.tags,
  score: Math.round(score * 1000) / 1000,
});

/** Default, offline: deterministic hashed keyword vectors over the same Mongo `knowledge` collection. */
export class LocalRetriever implements Retriever {
  private embedder = new LocalHashEmbedder();
  private memo = new Map<string, number[]>();

  async search(query: string, k: number, tags?: string[]): Promise<RetrieveResult> {
    const docs = await Knowledge.find(tags?.length ? { tags: { $in: tags } } : {}).lean();
    const q = this.embedder.vector(query);
    const scored: RetrievedNote[] = docs
      .map((d) => {
        const key = `${d.noteId}:${d.contentHash}`;
        let v = this.memo.get(key);
        if (!v) this.memo.set(key, (v = this.embedder.vector(noteText(d))));
        return toNote(d, cosine(q, v));
      })
      .filter((n) => n.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId))
      .slice(0, k);
    return { notes: scored, backend: "local" };
  }
}

/** Live: MongoDB Atlas Vector Search ($vectorSearch) with Gemini query embeddings. */
export class AtlasRetriever implements Retriever {
  constructor(
    private embedder: Embedder,
    private index = "knowledge_vector_index",
  ) {}

  async search(query: string, k: number, tags?: string[]): Promise<RetrieveResult> {
    const [queryVector] = await this.embedder.embed([query], "query");
    const docs = await Knowledge.aggregate<{
      noteId: string;
      title: string;
      body: string;
      sources: string[];
      tags: string[];
      score: number;
    }>([
      {
        $vectorSearch: {
          index: this.index,
          path: "embedding",
          queryVector,
          numCandidates: Math.max(50, k * 10),
          limit: k,
          ...(tags?.length ? { filter: { tags: { $in: tags } } } : {}),
        },
      },
      {
        $project: { _id: 0, noteId: 1, title: 1, body: 1, sources: 1, tags: 1, score: { $meta: "vectorSearchScore" } },
      },
    ]);
    return { notes: docs.map((d) => toNote(d, d.score)), backend: "atlas" };
  }
}

/** Try the live retriever; on a quota cap or any Atlas/embedding error, use the offline one and say so. */
export class FallbackRetriever implements Retriever {
  constructor(
    private primary: Retriever,
    private fallback: Retriever,
  ) {}

  async search(query: string, k: number, tags?: string[]): Promise<RetrieveResult> {
    try {
      return await this.primary.search(query, k, tags);
    } catch (err) {
      const why =
        err instanceof QuotaExceededError ? `embedding ${err.window} cap reached` : "vector search unavailable";
      return {
        ...(await this.fallback.search(query, k, tags)),
        notice: `Retrieval: ${why}; used offline keyword search.`,
      };
    }
  }
}
