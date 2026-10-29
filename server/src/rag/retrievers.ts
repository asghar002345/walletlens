import { Knowledge } from "../models/knowledge.js";
import { QuotaExceededError } from "../services/quota.js";
import { LocalHashEmbedder } from "./localEmbedder.js";
import {
  applyBoost,
  cosine,
  noteText,
  type Embedder,
  type RetrievedNote,
  type RetrieveResult,
  type Retriever,
  type SearchOptions,
} from "./types.js";

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

  async search(query: string, k: number, opts: SearchOptions = {}): Promise<RetrieveResult> {
    const { tags, boostTags } = opts;
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
      .sort((a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId));
    // Boost is applied after the relevance cut-off, so a tag alone can't pull in an unrelated note.
    const ranked = applyBoost(scored, boostTags).slice(0, k);
    return { notes: ranked, backend: "local" };
  }
}

/** Live: MongoDB Atlas Vector Search ($vectorSearch) with Gemini query embeddings. */
export class AtlasRetriever implements Retriever {
  constructor(
    private embedder: Embedder,
    private index = "knowledge_vector_index",
  ) {}

  async search(query: string, k: number, opts: SearchOptions = {}): Promise<RetrieveResult> {
    const { tags, boostTags } = opts;
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
          limit: boostTags?.length ? k * 2 : k,
          ...(tags?.length ? { filter: { tags: { $in: tags } } } : {}),
        },
      },
      {
        $project: { _id: 0, noteId: 1, title: 1, body: 1, sources: 1, tags: 1, score: { $meta: "vectorSearchScore" } },
      },
    ]);
    return {
      notes: applyBoost(
        docs.map((d) => toNote(d, d.score)),
        boostTags,
      ).slice(0, k),
      backend: "atlas",
    };
  }
}

/** Try the live retriever; on a quota cap or any Atlas/embedding error, use the offline one and say so. */
export class FallbackRetriever implements Retriever {
  constructor(
    private primary: Retriever,
    private fallback: Retriever,
  ) {}

  async search(query: string, k: number, opts?: SearchOptions): Promise<RetrieveResult> {
    try {
      return await this.primary.search(query, k, opts);
    } catch (err) {
      const why =
        err instanceof QuotaExceededError ? `embedding ${err.window} cap reached` : "vector search unavailable";
      return {
        ...(await this.fallback.search(query, k, opts)),
        notice: `Retrieval: ${why}; used offline keyword search.`,
      };
    }
  }
}
