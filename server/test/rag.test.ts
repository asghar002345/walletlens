import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import { Knowledge } from "../src/models/knowledge.js";
import { CacheEntry } from "../src/models/cache.js";
import { Usage } from "../src/models/usage.js";
import { loadNotes, seedKnowledge } from "../src/rag/seed.js";
import { LocalHashEmbedder } from "../src/rag/localEmbedder.js";
import { CachedEmbedder } from "../src/rag/cachedEmbedder.js";
import { GeminiEmbedder } from "../src/rag/geminiEmbedder.js";
import { AtlasRetriever, FallbackRetriever, LocalRetriever } from "../src/rag/retrievers.js";
import { selectRetriever } from "../src/rag/select.js";
import { QuotaExceededError } from "../src/services/quota.js";
import { runTool } from "../src/tools/runner.js";
import { cosine, type Embedder } from "../src/rag/types.js";
import { makeApp, testConfig } from "./helpers.js";

/** Counts calls; returns a fixed-size deterministic vector per text. */
class CountingEmbedder implements Embedder {
  readonly name = "counting@8";
  readonly dims = 8;
  calls = 0;
  texts = 0;
  async embed(texts: string[]) {
    this.calls++;
    this.texts += texts.length;
    return texts.map((t) => Array.from({ length: 8 }, (_, i) => (t.charCodeAt(i % t.length) % 7) / 7));
  }
}

beforeEach(async () => {
  await Promise.all([CacheEntry.deleteMany({}), Usage.deleteMany({})]);
});

describe("curated notes", () => {
  it("has about 50 valid notes with unique ids, sources and coverage of every required topic", () => {
    const notes = loadNotes();
    expect(notes.length).toBeGreaterThanOrEqual(45);
    expect(new Set(notes.map((n) => n.noteId)).size).toBe(notes.length);
    const tags = new Set(notes.flatMap((n) => n.tags));
    for (const t of [
      "erc20",
      "erc721",
      "erc1155",
      "erc2612",
      "erc4337",
      "permit",
      "operator",
      "poisoning",
      "airdrop",
      "honeypot",
      "proxy",
    ])
      expect(tags, t).toContain(t);
  });

  it("is seeded into the knowledge collection idempotently", async () => {
    await seedKnowledge();
    expect(await Knowledge.countDocuments()).toBe(loadNotes().length);
  });

  it("serves notes over the API", async () => {
    const app = makeApp();
    const list = await request(app).get("/api/knowledge");
    expect(list.body.notes.length).toBe(loadNotes().length);
    const one = await request(app).get("/api/knowledge/scam-permit-phishing");
    expect(one.body.note.sources[0]).toMatch(/^https:\/\//);
    expect((await request(app).get("/api/knowledge/nope")).status).toBe(404);
  });
});

describe("local retrieval (default, offline)", () => {
  it("embeds deterministically and normalises", () => {
    const e = new LocalHashEmbedder();
    const a = e.vector("unlimited approval");
    expect(a).toEqual(e.vector("unlimited approval"));
    expect(cosine(a, a)).toBeCloseTo(1);
  });

  it.each([
    ["unlimited ERC-20 approve allowance", "std-erc20-unlimited"],
    ["permit signature phishing", "scam-permit-phishing"],
    ["setApprovalForAll operator drainer", "scam-nft-drainer"],
    ["lookalike address poisoning in history", "scam-address-poisoning"],
    ["token name instructions prompt injection metadata", "scam-token-name-injection"],
    ["honeypot cannot sell", "scam-honeypot"],
    ["upgradeable proxy implementation", "std-proxy-basics"],
  ])("finds the right note for %s", async (query, expected) => {
    const r = await new LocalRetriever().search(query, 3);
    expect(r.backend).toBe("local");
    expect(r.notes.map((n) => n.noteId)).toContain(expected);
  });

  it("returns nothing for an unrelated query and respects tag filters", async () => {
    const r = new LocalRetriever();
    expect((await r.search("banana smoothie recipe", 3)).notes).toEqual([]);
    const tagged = await r.search("approval", 5, { tags: ["erc1155"] });
    expect(tagged.notes.every((n) => n.tags.includes("erc1155"))).toBe(true);
  });

  it("boosts notes whose tags match decodeCalldata flags, without pulling in unrelated notes", async () => {
    const r = new LocalRetriever();
    const q = "unlimited ERC-20 approve allowance";
    const plain = await r.search(q, 3);
    expect(plain.notes[0].noteId).not.toBe("std-erc20-unlimited");
    const boosted = await r.search(q, 3, { boostTags: ["unlimited"] });
    expect(boosted.notes[0].noteId).toBe("std-erc20-unlimited");
    expect((await r.search("banana smoothie recipe", 3, { boostTags: ["unlimited"] })).notes).toEqual([]);
  });

  it("retrieveNotes tool validates args and logs the call", async () => {
    const ctx = { chain: {} as never, retriever: new LocalRetriever() };
    const ok = await runTool(
      new Types.ObjectId(),
      "retrieveNotes",
      { query: "permit signature phishing approval" },
      ctx,
    );
    expect((ok.data as { notes: unknown[] }).notes).toHaveLength(3);
    expect((await runTool(new Types.ObjectId(), "retrieveNotes", { query: "x", k: 50 }, ctx)).ok).toBe(false);
  });
});

describe("embedding cache and caps", () => {
  it("caches embeddings in Mongo so repeat texts cost no calls", async () => {
    const inner = new CountingEmbedder();
    const e = new CachedEmbedder(inner, { perMinute: 100, perDay: 100 });
    await e.embed(["a", "b"], "document");
    const again = await e.embed(["a", "b", "c"], "document");
    expect(inner.calls).toBe(2);
    expect(inner.texts).toBe(3);
    expect(again).toHaveLength(3);
  });

  it("throws QuotaExceededError when the embedding cap is hit, without calling the provider", async () => {
    const inner = new CountingEmbedder();
    const e = new CachedEmbedder(inner, { perMinute: 0, perDay: 0 });
    await expect(e.embed(["fresh text"], "query")).rejects.toBeInstanceOf(QuotaExceededError);
    expect(inner.calls).toBe(0);
  });

  it("only re-embeds notes whose content changed", async () => {
    const inner = new CountingEmbedder();
    const first = await seedKnowledge(inner);
    expect(first.embedded).toBe(loadNotes().length);
    expect((await seedKnowledge(inner)).embedded).toBe(0);
    await Knowledge.updateMany({}, { $unset: { embeddingModel: 1, embeddedHash: 1, embedding: 1 } });
  });
});

describe("live retrieval wiring (no network)", () => {
  it("falls back to local search with a notice when the embedding cap is hit", async () => {
    const capped = new CachedEmbedder(new CountingEmbedder(), { perMinute: 0, perDay: 0 });
    const r = await new FallbackRetriever(new AtlasRetriever(capped), new LocalRetriever()).search(
      "permit phishing",
      3,
    );
    expect(r.backend).toBe("local");
    expect(r.notice).toMatch(/cap reached/);
    expect(r.notes[0].noteId).toBeDefined();
  });

  it("falls back when $vectorSearch is unavailable (not an Atlas cluster)", async () => {
    const r = await new FallbackRetriever(new AtlasRetriever(new CountingEmbedder()), new LocalRetriever()).search(
      "permit phishing",
      3,
    );
    expect(r.notice).toMatch(/vector search unavailable/);
  });

  it("uses the offline retriever unless live mode, a Gemini key and Atlas are all configured", () => {
    expect(selectRetriever(testConfig())).toBeInstanceOf(LocalRetriever);
    expect(selectRetriever(testConfig({ mockMode: false, geminiApiKey: "k" }))).toBeInstanceOf(LocalRetriever);
    expect(selectRetriever(testConfig({ mockMode: false, geminiApiKey: "k", atlasVectorSearch: true }))).toBeInstanceOf(
      FallbackRetriever,
    );
  });

  it("sends a batchEmbedContents request with task type and dimensions", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ embeddings: [{ values: [0.1, 0.2] }] })));
    const out = await new GeminiEmbedder("key", "gemini-embedding-001", 768, fetchFn).embed(["hello"], "query");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/gemini-embedding-001:batchEmbedContents/);
    const body = JSON.parse(String(init.body));
    expect(body.requests[0]).toMatchObject({ taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 });
    expect(out).toEqual([[0.1, 0.2]]);
  });
});
