import type { AppConfig } from "../config.js";
import { CachedEmbedder } from "./cachedEmbedder.js";
import { GeminiEmbedder } from "./geminiEmbedder.js";
import { AtlasRetriever, FallbackRetriever, LocalRetriever } from "./retrievers.js";
import type { Embedder, Retriever } from "./types.js";

/** Live embedder only with MOCK_MODE=false, a Gemini key and ATLAS_VECTOR_SEARCH=true. */
export function selectEmbedder(config: AppConfig): Embedder | null {
  if (config.mockMode || !config.geminiApiKey || !config.atlasVectorSearch) return null;
  return new CachedEmbedder(new GeminiEmbedder(config.geminiApiKey, config.geminiEmbedModel), config.caps.geminiEmbed);
}

export function selectRetriever(config: AppConfig): Retriever {
  const local = new LocalRetriever();
  const embedder = selectEmbedder(config);
  return embedder ? new FallbackRetriever(new AtlasRetriever(embedder, config.vectorIndex), local) : local;
}
