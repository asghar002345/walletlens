import { ProviderError, type FetchLike } from "../llm/types.js";
import type { EmbedTask, Embedder } from "./types.js";

/** Gemini embeddings (free tier). Only constructed when GEMINI_API_KEY is set and MOCK_MODE=false. */
export class GeminiEmbedder implements Embedder {
  readonly name: string;
  constructor(
    private apiKey: string,
    private model = "gemini-embedding-001",
    readonly dims = 768,
    private fetchFn: FetchLike = fetch,
  ) {
    this.name = `${model}@${dims}`;
  }

  async embed(texts: string[], task: EmbedTask): Promise<number[][]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          taskType: task === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
          outputDimensionality: this.dims,
        })),
      }),
    });
    if (!res.ok) throw new ProviderError("gemini-embed", res.status, `HTTP ${res.status}`);
    const body = (await res.json()) as { embeddings: { values: number[] }[] };
    return body.embeddings.map((e) => e.values);
  }
}
